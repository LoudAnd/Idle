// Source scanners for the architecture tests (GDD §2 "Enforcement", §21.1).
//
// Each rule takes `{ path, source }` records, where `path` is a repo-relative virtual path, so a
// planted fixture can be checked as if it lived at, say, `src/engine/x.ts`. The tokenizer
// understands `//` and `/* */` comments, '…' and "…" strings, template literals (whose `${…}`
// parts stay code) and regular-expression literals (a `/` where an expression may start, so a
// `/*`, quote or backtick inside a regex cannot hide the code after it). It fails closed: a file
// that ends inside a block comment, a template literal or a `${…}` is a violation of every rule
// (`scan-tokenizer`), so a confused tokenizer can never silently blank out the rest of a file.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface SourceFile {
  /** Repo-relative path with forward slashes, e.g. `src/engine/num.ts`. */
  readonly path: string;
  readonly source: string;
}

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly text: string;
}

/** Every file under `root` (absolute) whose name ends in one of `exts`, sorted. */
export function listFiles(root: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

function toRepoPath(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join('/');
}

/** The TypeScript and JavaScript sources under a repo-relative directory (default `src`). */
export function loadSources(dir = 'src'): SourceFile[] {
  return listFiles(join(REPO_ROOT, dir), ['.ts', '.tsx', '.js', '.jsx', '.mjs']).map((abs) => ({
    path: toRepoPath(abs),
    source: readFileSync(abs, 'utf8'),
  }));
}

/** A fixture file under tests/arch/fixtures, presented at a virtual path. */
export function loadFixture(fixture: string, virtualPath: string): SourceFile {
  const abs = join(REPO_ROOT, 'tests', 'arch', 'fixtures', fixture);
  return { path: virtualPath, source: readFileSync(abs, 'utf8') };
}

// ---------------------------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------------------------

export interface StringLiteral {
  /** The literal's raw text between the quotes (for templates: one static part). */
  readonly value: string;
  readonly line: number;
  /** Offset of the opening quote (or of the template part). */
  readonly start: number;
}

interface Scan {
  /** Source with comments blanked out (newlines kept). */
  readonly noComments: string;
  /** Source with comments, string contents and regex bodies blanked out (newlines kept). */
  readonly codeOnly: string;
  readonly strings: StringLiteral[];
  /** Why the file did not tokenize cleanly (it ended inside a comment or template), or null. */
  readonly problem: { readonly line: number; readonly reason: string } | null;
}

const cache = new Map<string, Scan>();

function blank(s: string): string {
  return s.replace(/[^\n]/g, ' ');
}

/** Keywords after which a `/` starts a regular expression, not a division. */
const REGEX_AFTER_WORD = new Set([
  'return',
  'typeof',
  'case',
  'do',
  'else',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'instanceof',
  'yield',
  'await',
]);

/**
 * True when a `/` at this point starts a regex literal: the previous significant code character
 * is an operator or punctuation that cannot end an expression, a keyword such as `return`, or
 * nothing at all. After an identifier, a number, `)` or `]` it is a division.
 */
function regexMayStart(code: string): boolean {
  let k = code.length - 1;
  while (k >= 0 && /\s/.test(code[k]!)) k--;
  if (k < 0) return true;
  const c = code[k]!;
  if ('(,=:[!&|?{};+-*%<>~^'.includes(c)) return true;
  if (!/[\w$]/.test(c)) return false;
  let w = k;
  while (w > 0 && /[\w$]/.test(code[w - 1]!)) w--;
  return REGEX_AFTER_WORD.has(code.slice(w, k + 1));
}

/** The end (exclusive, flags included) of a regex literal starting at `start`, or -1. */
function regexEnd(src: string, start: number): number {
  let j = start + 1;
  let inClass = false;
  while (j < src.length) {
    const ch = src[j]!;
    if (ch === '\n') return -1;
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
    } else if (ch === '[') {
      inClass = true;
    } else if (ch === '/') {
      j++;
      while (j < src.length && /[a-z]/i.test(src[j]!)) j++;
      return j;
    }
    j++;
  }
  return -1;
}

function tokenize(src: string): Scan {
  const hit = cache.get(src);
  if (hit) return hit;
  let noComments = '';
  let codeOnly = '';
  const strings: StringLiteral[] = [];
  let line = 1;
  let i = 0;
  // Template nesting: each entry counts open braces inside one `${…}`.
  const braces: number[] = [];
  let problem: Scan['problem'] = null;
  const fail = (reason: string, atLine: number): void => {
    problem ??= { line: atLine, reason };
  };

  const emit = (text: string, keepInNoComments: boolean, keepInCode: boolean): void => {
    noComments += keepInNoComments ? text : blank(text);
    codeOnly += keepInCode ? text : blank(text);
    for (const ch of text) if (ch === '\n') line++;
  };

  // Reads a template's static part starting at i (just after ` or }), up to ` or ${.
  const templatePart = (): void => {
    const start = i;
    const startLine = line;
    if (i >= src.length) fail('unterminated template literal', startLine);
    let value = '';
    while (i < src.length) {
      const ch = src[i]!;
      if (ch === '\\') {
        value += src.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === '`') break;
      if (ch === '$' && src[i + 1] === '{') break;
      value += ch;
      i++;
    }
    strings.push({ value, line: startLine, start });
    emit(src.slice(start, i), true, false);
    if (i >= src.length) fail('unterminated template literal', startLine);
    if (src[i] === '`') {
      emit('`', true, true);
      i++;
    } else if (src[i] === '$') {
      emit('${', true, true);
      i += 2;
      braces.push(0);
    }
  };

  while (i < src.length) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? src.length : end;
      emit(src.slice(i, stop), false, false);
      i = stop;
    } else if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) fail('unterminated block comment', line);
      const stop = end < 0 ? src.length : end + 2;
      emit(src.slice(i, stop), false, false);
      i = stop;
    } else if (ch === '/' && regexMayStart(codeOnly)) {
      const stop = regexEnd(src, i);
      if (stop < 0) {
        emit(ch, true, true); // not a regex after all: a division
        i++;
      } else {
        const close = src.lastIndexOf('/', stop - 1);
        emit('/', true, true);
        emit(src.slice(i + 1, close), true, false);
        emit(src.slice(close, stop), true, true);
        i = stop;
      }
    } else if (ch === "'" || ch === '"') {
      const start = i;
      const startLine = line;
      let j = i + 1;
      while (j < src.length && src[j] !== ch && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      const stop = Math.min(j + 1, src.length);
      strings.push({ value: src.slice(i + 1, j), line: startLine, start });
      emit(ch, true, true);
      emit(src.slice(i + 1, j), true, false);
      if (stop > j) emit(src.slice(j, stop), true, true);
      i = stop;
    } else if (ch === '`') {
      emit('`', true, true);
      i++;
      templatePart();
    } else if (braces.length > 0 && ch === '{') {
      braces[braces.length - 1] = (braces[braces.length - 1] ?? 0) + 1;
      emit(ch, true, true);
      i++;
    } else if (braces.length > 0 && ch === '}') {
      const depth = braces[braces.length - 1] ?? 0;
      emit(ch, true, true);
      i++;
      if (depth === 0) {
        braces.pop();
        templatePart();
      } else {
        braces[braces.length - 1] = depth - 1;
      }
    } else {
      emit(ch, true, true);
      i++;
    }
  }
  if (braces.length > 0) fail('unterminated template substitution', line);
  const scan = { noComments, codeOnly, strings, problem };
  cache.set(src, scan);
  return scan;
}

/**
 * `scan-tokenizer`: a file that ended inside a block comment, a template literal or a `${…}`.
 * Every rule reports it, so a tokenizer confused by unusual code fails closed.
 */
export function scanTokenizer(files: readonly SourceFile[]): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    const p = tokenize(f.source).problem;
    if (p) out.push({ file: f.path, line: p.line, rule: 'scan-tokenizer', text: p.reason });
  }
  return out;
}

/** The source with comments replaced by spaces (line numbers are preserved). */
export function stripComments(src: string): string {
  return tokenize(src).noComments;
}

/** The source with comments, string contents and regex bodies replaced by spaces. */
export function stripCommentsAndStrings(src: string): string {
  return tokenize(src).codeOnly;
}

/** Every string literal and static template part, in source order. */
export function stringLiterals(src: string): StringLiteral[] {
  return tokenize(src).strings;
}

function lineAt(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

function lineText(src: string, line: number): string {
  return (src.split('\n')[line - 1] ?? '').trim();
}

// ---------------------------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------------------------

export interface ImportRef {
  readonly specifier: string;
  readonly line: number;
  /** The offset of the specifier's opening quote. */
  readonly start: number;
}

const IMPORT_PATTERNS: readonly RegExp[] = [
  // import x from '…', import { a } from '…', import type { T } from '…', import * as n from '…'
  /\bimport\s+(?!\()[^'"`;]*?\bfrom\s*(['"])([^'"\n]+)\1/g,
  // export { a } from '…', export * from '…', export type { T } from '…'
  /\bexport\s+[^'"`;]*?\bfrom\s*(['"])([^'"\n]+)\1/g,
  // import '…' (side effects only)
  /\bimport\s*(['"])([^'"\n]+)\1/g,
  // import('…') and require('…')
  /\bimport\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)/g,
  /\brequire\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)/g,
];

/** Static imports, re-exports, side-effect imports, `import()` and `require()`. */
export function importSpecifiers(src: string): ImportRef[] {
  const code = stripComments(src);
  const seen = new Set<number>();
  const out: ImportRef[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const m of code.matchAll(pattern)) {
      const spec = m[2]!;
      const start = (m.index ?? 0) + m[0].lastIndexOf(m[1]! + spec);
      if (seen.has(start)) continue;
      seen.add(start);
      out.push({ specifier: spec, line: lineAt(code, start), start });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function isRelative(spec: string): boolean {
  return spec.startsWith('./') || spec.startsWith('../');
}

function resolveRelative(fromPath: string, spec: string): string {
  return posix.normalize(posix.join(posix.dirname(fromPath), spec));
}

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

function inDir(path: string, dir: string): boolean {
  return path.startsWith(dir + '/');
}

function scanPattern(
  files: readonly SourceFile[],
  rule: string,
  pattern: RegExp,
  view: (src: string) => string,
): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    const text = view(f.source);
    for (const m of text.matchAll(
      new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g'),
    )) {
      const line = lineAt(text, m.index ?? 0);
      out.push({ file: f.path, line, rule, text: lineText(f.source, line) });
    }
  }
  return out;
}

/**
 * Environment globals banned in src/engine (GDD §21.1: no DOM, no clock, no randomness, no
 * storage, timers, network, workers or Node globals). `tsconfig.engine.json` (lib ES2023, no
 * DOM or Node types) is the first line of defence; this list catches what a type check cannot,
 * such as a global that the ES lib declares, and runs on the planted fixtures.
 */
export const ENGINE_GLOBALS = [
  'window',
  'document',
  'Date',
  'performance',
  'globalThis',
  'self',
  'global',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'queueMicrotask',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'MessageChannel',
  'postMessage',
  'addEventListener',
  'removeEventListener',
  'process',
  'Buffer',
  '__dirname',
  '__filename',
  'crypto',
  'Intl',
  'eval',
] as const;

// A bare identifier: not a property (`.x`) and not part of a longer name.
const GLOBAL_RE = new RegExp(`(?<![.\\w$])(${ENGINE_GLOBALS.join('|')})\\b`, 'g');

/**
 * True when the match is an object key or a type annotation (`{ window: 1 }`, `x?: T`): the
 * name follows `{`, `,`, `;` or `(` and is followed by `:` or `?:`. A ternary such as
 * `a ? window : b` is still flagged.
 */
function isKeyPosition(code: string, start: number, end: number): boolean {
  if (!/^\s*\??:/.test(code.slice(end))) return false;
  const before = code.slice(0, start).trimEnd();
  return /[{,;(]$/.test(before) || before.length === 0;
}

function scanGlobals(files: readonly SourceFile[]): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    const code = stripCommentsAndStrings(f.source);
    for (const m of code.matchAll(GLOBAL_RE)) {
      const start = m.index ?? 0;
      if (isKeyPosition(code, start, start + m[0].length)) continue;
      const line = lineAt(code, start);
      out.push({ file: f.path, line, rule: 'engine-global', text: lineText(f.source, line) });
    }
  }
  return out;
}

/**
 * `src/engine/**`: environment access: the globals above, `Math.random`, `Math` used other than
 * as `Math.<name>` (so `Math['random']`, `const { random } = Math` and `const M = Math` are
 * caught), `import.meta` (`import.meta.env` is undefined under Node), the `Function` constructor
 * and `toLocale*String`.
 */
export function scanEngineEnvironment(files: readonly SourceFile[]): Violation[] {
  const engine = files.filter((f) => inDir(f.path, 'src/engine'));
  const code = stripCommentsAndStrings;
  return [
    ...scanTokenizer(engine),
    ...scanGlobals(engine),
    ...scanPattern(engine, 'engine-random', /\bMath\s*\.\s*random\b/g, code),
    ...scanPattern(engine, 'engine-math-alias', /(?<![.\w$])Math\b(?!\s*\.\s*[A-Za-z_$])/g, code),
    ...scanPattern(engine, 'engine-import-meta', /\bimport\s*\.\s*meta\b/g, code),
    ...scanPattern(engine, 'engine-eval', /(?<![.\w$])Function\s*\(|\bnew\s+Function\b/g, code),
    ...scanPattern(engine, 'engine-locale', /\btoLocale\w*String\b/g, code),
  ];
}

/**
 * `src/engine/**`: relative imports stay inside src/engine; the only bare import is
 * `break_eternity.js`, and only from src/engine/num.ts.
 */
export function scanEngineImports(files: readonly SourceFile[]): Violation[] {
  const out: Violation[] = scanTokenizer(files.filter((f) => inDir(f.path, 'src/engine')));
  for (const f of files) {
    if (!inDir(f.path, 'src/engine')) continue;
    for (const ref of importSpecifiers(f.source)) {
      const spec = ref.specifier;
      let rule: string | null = null;
      if (isRelative(spec)) {
        if (!inDir(resolveRelative(f.path, spec), 'src/engine')) rule = 'engine-import-outside';
      } else if (!(spec === 'break_eternity.js' && f.path === 'src/engine/num.ts')) {
        rule = 'engine-import-bare';
      }
      if (rule)
        out.push({ file: f.path, line: ref.line, rule, text: lineText(f.source, ref.line) });
    }
  }
  return out;
}

/** `src/engine/**`: every relative import ends in `.ts` (Node type stripping, GDD §21.6). */
export function scanEngineImportExtensions(files: readonly SourceFile[]): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    if (!inDir(f.path, 'src/engine')) continue;
    for (const ref of importSpecifiers(f.source)) {
      if (isRelative(ref.specifier) && !ref.specifier.endsWith('.ts')) {
        out.push({
          file: f.path,
          line: ref.line,
          rule: 'engine-import-extension',
          text: lineText(f.source, ref.line),
        });
      }
    }
  }
  return out;
}

const NUM_MODULE = 'src/engine/num.ts';

/** `src/**` except num.ts: no import of `break_eternity.js` (or a subpath) in any form. */
export function scanBreakEternityImports(files: readonly SourceFile[]): Violation[] {
  const out: Violation[] = scanTokenizer(
    files.filter((f) => inDir(f.path, 'src') && f.path !== NUM_MODULE),
  );
  for (const f of files) {
    if (!inDir(f.path, 'src') || f.path === NUM_MODULE) continue;
    for (const ref of importSpecifiers(f.source)) {
      const s = ref.specifier;
      if (s === 'break_eternity.js' || s.startsWith('break_eternity.js/')) {
        out.push({
          file: f.path,
          line: ref.line,
          rule: 'num-library-import',
          text: lineText(f.source, ref.line),
        });
      }
    }
  }
  return out;
}

/**
 * The `Decimal` log methods. In break_eternity.js 2.1.3 each returns NaN for 0 (GDD §4.1), so
 * outside num.ts a `Num` is only ever logged through the safe helpers.
 */
export const NUM_LOG_METHODS = ['log10', 'log2', 'ln', 'log', 'absLog10', 'pLog10', 'logarithm'];

const LOG_NAMES = NUM_LOG_METHODS.join('|');
/** `.log10(`, `.log10?.(` and `?.log10(` (the receiver is checked separately). */
const LOG_CALL_RE = new RegExp(`\\.\\s*(${LOG_NAMES})\\s*(?:\\?\\.\\s*)?\\(`, 'g');
/** `['log10']`, `["ln"]`, `` [`log`] `` (scanned with strings kept). */
const LOG_BRACKET_RE = new RegExp(`\\[\\s*(['"\`])(?:${LOG_NAMES})\\1\\s*\\]`, 'g');

/** The identifier just before a `.` at `dot` (skipping `?` of `?.`), or null. */
function receiverBefore(code: string, dot: number): string | null {
  let k = dot - 1;
  while (k >= 0 && /\s/.test(code[k]!)) k--;
  if (code[k] === '?') k--;
  while (k >= 0 && /\s/.test(code[k]!)) k--;
  const end = k + 1;
  while (k >= 0 && /[\w$]/.test(code[k]!)) k--;
  const name = code.slice(k + 1, end);
  if (name.length === 0) return null;
  let b = k;
  while (b >= 0 && /\s/.test(code[b]!)) b--;
  return code[b] === '.' ? null : name; // `a.Math.log2(` is not the global Math
}

/** Names bound by `import * as N from '…/num.ts'` (the sanctioned helpers, namespaced). */
function numNamespaces(src: string): Set<string> {
  const out = new Set<string>();
  const re = /\bimport\s+\*\s+as\s+([\w$]+)\s+from\s*(['"])([^'"\n]*\/)?num\.ts\2/g;
  for (const m of stripComments(src).matchAll(re)) out.add(m[1]!);
  return out;
}

/**
 * `src/**` except num.ts: no raw log method on a `Num` (`.log10()`, `.log2()`, `.ln()`,
 * `.log(b)`, `.absLog10()`, `.pLog10()`, `.logarithm(b)`), called directly, through `?.`, or by a
 * bracketed name. Logs of doubles through `Math` (`Math.log2(n)`, which the GDD's threshold and
 * `log2Dec` recipes need), `console.log` and the num.ts helpers (also as `N.log2` after
 * `import * as N from './num.ts'`) are allowed.
 */
export function scanRawLogs(files: readonly SourceFile[]): Violation[] {
  const rest = files.filter((f) => inDir(f.path, 'src') && f.path !== NUM_MODULE);
  const out: Violation[] = [...scanTokenizer(rest)];
  for (const f of rest) {
    const code = stripCommentsAndStrings(f.source);
    const namespaces = numNamespaces(f.source);
    for (const m of code.matchAll(LOG_CALL_RE)) {
      const dot = m.index ?? 0;
      const receiver = receiverBefore(code, dot);
      if (receiver === 'Math') continue;
      if (receiver === 'console' && m[1] === 'log') continue;
      if (receiver !== null && namespaces.has(receiver)) continue;
      const line = lineAt(code, dot);
      out.push({ file: f.path, line, rule: 'num-raw-log', text: lineText(f.source, line) });
    }
  }
  return [...out, ...scanPattern(rest, 'num-raw-log', LOG_BRACKET_RE, stripComments)];
}

/** `src/**` except num.ts: nothing references the bench-only op counter. */
export function scanOpCounter(files: readonly SourceFile[]): Violation[] {
  const rest = files.filter((f) => inDir(f.path, 'src') && f.path !== NUM_MODULE);
  return [
    ...scanTokenizer(rest),
    ...scanPattern(rest, 'num-op-counter', /\binstallOpCounter\b/g, stripComments),
  ];
}

/** Web Audio APIs that synthesize or write samples (GDD §2: no synthesized audio). */
export const AUDIO_BANNED = [
  'createOscillator',
  'createBuffer\\b',
  'new\\s+AudioBuffer\\b',
  'copyToChannel',
  'getChannelData',
  'createPeriodicWave',
  'createConstantSource',
  'createScriptProcessor',
  'audioWorklet',
  'AudioWorkletNode',
  'OscillatorNode',
  'OfflineAudioContext',
] as const;

/** Audio MIME types (a Blob or data URI of built sample bytes needs one). */
const AUDIO_MIME =
  /^audio\/(?:wav|wave|x-wav|vnd\.wave|webm|ogg|opus|mpeg|mp3|mp4|aac|flac|l16|basic|aiff|x-aiff|\*)(?:\s*;.*)?$/i;

/** A file that plays audio: from here on its bytes must come from a shipped file. */
const PLAYS_AUDIO =
  /\b(?:AudioContext|webkitAudioContext|decodeAudioData|createBufferSource|HTMLAudioElement)\b|\bnew\s+Audio\b|createElement\s*\(\s*['"`]audio['"`]/;

/** Building bytes in memory: typed arrays, ArrayBuffers, DataViews and object URLs. */
const BUILT_BYTES =
  /\bnew\s+(?:Shared)?ArrayBuffer\b|\bnew\s+DataView\b|\b(?:Big)?(?:Int|Uint)(?:8|16|32|64)(?:Clamped)?Array\b|\bFloat(?:32|64)Array\b|\bcreateObjectURL\b/g;

/**
 * `src/**`: no synthesized audio (GDD §2). Comments stripped, strings kept, so
 * `ctx['createOscillator']` is caught too.
 * - `audio-synthesis`: the Web Audio APIs above.
 * - `audio-data-uri`: a `data:audio/…` URI (a WAV built in JavaScript, as jsfxr's riffwave does).
 * - `audio-wav-header`: a `'RIFF'`, `'WAVE'` or `'fmt '` literal, or the same as a 32-bit
 *   constant (the header of a hand-built WAV).
 * - `audio-mime`: an audio MIME literal such as `'audio/wav'` (a Blob of built bytes), except as
 *   the argument of `canPlayType`.
 * - `audio-built-bytes`: in a file that plays audio, typed arrays, ArrayBuffers, DataViews or
 *   object URLs. Audio code plays shipped files by URL or decodes fetched bytes, nothing else.
 */
export function scanAudio(files: readonly SourceFile[]): Violation[] {
  const all = files.filter((f) => inDir(f.path, 'src'));
  const out: Violation[] = [
    ...scanTokenizer(all),
    ...scanPattern(all, 'audio-synthesis', new RegExp(AUDIO_BANNED.join('|'), 'g'), stripComments),
    ...scanPattern(all, 'audio-data-uri', /data:\s*audio\//gi, stripComments),
    ...scanPattern(
      all,
      'audio-wav-header',
      /(['"`])(?:RIFF|WAVE|fmt )\1|\b0x(?:46464952|52494646|45564157|57415645)\b/gi,
      stripComments,
    ),
  ];
  for (const f of all) {
    const code = stripComments(f.source);
    for (const lit of stringLiterals(f.source)) {
      if (!AUDIO_MIME.test(lit.value)) continue;
      if (/canPlayType\s*\(\s*$/.test(code.slice(0, lit.start))) continue;
      out.push({
        file: f.path,
        line: lit.line,
        rule: 'audio-mime',
        text: lineText(f.source, lit.line),
      });
    }
  }
  const players = all.filter((f) => PLAYS_AUDIO.test(stripCommentsAndStrings(f.source)));
  out.push(...scanPattern(players, 'audio-built-bytes', BUILT_BYTES, stripCommentsAndStrings));
  return out;
}

/** A readable list of violations for assertion messages. */
export function describeViolations(vs: readonly Violation[]): string {
  return vs.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.text}`).join('\n');
}
