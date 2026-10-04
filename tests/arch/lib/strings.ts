// The string lint (GDD §2 "Enforcement", `tests/arch/strings.test.ts`). Player-visible text
// comes from `src/ui/strings.ts` (chrome labels and templates, ≤ 32 characters, no sentences) and
// `src/ui/legal.ts`, never from literals scattered through components or content tables.
//
// The JSX and content rules parse each file with Vite's `parseAst` (rolldown/oxc, ESTree with
// JSX and TypeScript nodes): TypeScript 7 has no JavaScript compiler API. A file that does not
// parse is a violation of every rule (`parse-error`), so the lint fails closed.
//
// Rules (each takes values or `{ path, source }` records, like `scan.ts`):
// - `string-length` / `string-sentence`: every string leaf of the exported tables is at most 32
//   code points and does not match the sentence pattern.
// - `jsx-text`: in `src/**/*.tsx` outside strings.ts/legal.ts, no JSX text with 2 or more
//   letters, and no string literal or static template with 2 or more letters inside a JSX child
//   expression (also in the branches of `?:`, `&&` and `||`).
// - `jsx-attr`: no such literal as the value of a text attribute (`aria-label`, `title`,
//   `placeholder`, `alt`, `label`, …). Ids, classes, `data-*`, `type` and `role` are not text.
// - `content-label`: in `src/engine/content/**`, every `label:` is a string literal that is a
//   `strings.ts` key (shorthand, identifiers and templates are flagged: fail closed).
// - `format-letters`: `src/engine/format.ts` has no string literal with 2 or more letters, and no
//   single-letter literal other than the notation's `e` (its words come from its table
//   parameter).
// - `template-literal`: the first argument of `fill`/`fillParts` is never a literal, so every
//   template is a `strings.ts` entry.
import { parseAst } from 'vite';
import type { SourceFile, Violation } from './scan.ts';

export const MAX_ENTRY_LENGTH = 32;
/** A sentence (GDD §2): the trailing `(\s|$)` lets decimals such as `0.03c` through. */
export const SENTENCE = /[a-z]{3,}\s[a-z]{3,}.*[.!?](\s|$)/i;

const LETTER = /\p{L}/gu;

/** The number of letters (any script) in s. */
export function letterCount(s: string): number {
  return s.match(LETTER)?.length ?? 0;
}

/** The length of s in code points (so `×` and `λ` count once). */
export function codePoints(s: string): number {
  return [...s].length;
}

export interface Leaf {
  readonly path: string;
  readonly value: string;
}

/** Every string leaf of a table (objects and arrays), with its key path. */
export function stringLeaves(value: unknown, path: string): Leaf[] {
  const out: Leaf[] = [];
  const walk = (v: unknown, p: string): void => {
    if (typeof v === 'string') out.push({ path: p, value: v });
    else if (Array.isArray(v)) v.forEach((e, i) => walk(e, `${p}[${i}]`));
    else if (typeof v === 'object' && v !== null) {
      for (const [k, e] of Object.entries(v)) walk(e, `${p}.${k}`);
    }
  };
  walk(value, path);
  return out;
}

/** `string-length` and `string-sentence` over the leaves of a `strings.ts`-like table. */
export function checkEntries(leaves: readonly Leaf[], file: string): Violation[] {
  const out: Violation[] = [];
  for (const l of leaves) {
    if (codePoints(l.value) > MAX_ENTRY_LENGTH) {
      out.push({ file, line: 0, rule: 'string-length', text: `${l.path}: ${l.value}` });
    }
    if (SENTENCE.test(l.value)) {
      out.push({ file, line: 0, rule: 'string-sentence', text: `${l.path}: ${l.value}` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The AST
// ---------------------------------------------------------------------------------------------

/** An ESTree node as `parseAst` returns it. */
export interface Node {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
}

function isNode(v: unknown): v is Node {
  return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';
}

/** The child nodes of a node, in source order. */
function children(n: Node): Node[] {
  const out: Node[] = [];
  for (const [k, v] of Object.entries(n)) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    if (Array.isArray(v)) {
      for (const e of v) if (isNode(e)) out.push(e);
    } else if (isNode(v)) {
      out.push(v);
    }
  }
  return out;
}

/** Type-only subtrees: nothing in them reaches the player. */
const TYPE_ONLY = new Set([
  'TSTypeAnnotation',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeParameterInstantiation',
  'TSTypeParameterDeclaration',
  'TSLiteralType',
]);

/** Visits every node (skipping type-only subtrees), with its parent. */
function walk(root: Node, visit: (n: Node, parent: Node | null) => void): void {
  const go = (n: Node, parent: Node | null): void => {
    if (TYPE_ONLY.has(n.type)) return;
    visit(n, parent);
    for (const c of children(n)) go(c, n);
  };
  go(root, null);
}

interface Parsed {
  readonly file: SourceFile;
  readonly ast: Node | null;
  readonly error: string | null;
}

const parseCache = new Map<string, Parsed>();

function parse(file: SourceFile): Parsed {
  const key = `${file.path}\u0000${file.source}`;
  const hit = parseCache.get(key);
  if (hit) return hit;
  let out: Parsed;
  try {
    const lang = file.path.endsWith('.tsx') || file.path.endsWith('.jsx') ? 'tsx' : 'ts';
    const ast = parseAst(file.source, { lang }) as unknown;
    out = { file, ast: isNode(ast) ? ast : null, error: isNode(ast) ? null : 'no AST' };
  } catch (e) {
    out = { file, ast: null, error: e instanceof Error ? e.message.split('\n')[0]! : String(e) };
  }
  parseCache.set(key, out);
  return out;
}

function lineOf(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

function violation(f: SourceFile, n: Node, rule: string, text: string): Violation {
  return { file: f.path, line: lineOf(f.source, n.start), rule, text };
}

/** Parses each file; a file that does not parse is a `parse-error` (fail closed). */
function parsed(files: readonly SourceFile[], out: Violation[]): { f: SourceFile; ast: Node }[] {
  const ok: { f: SourceFile; ast: Node }[] = [];
  for (const f of files) {
    const p = parse(f);
    if (p.ast === null)
      out.push({ file: f.path, line: 0, rule: 'parse-error', text: p.error ?? '' });
    else ok.push({ f, ast: p.ast });
  }
  return ok;
}

/** The static text a literal or template contributes, or null for anything else. */
function literalText(n: Node): string | null {
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral') {
    const quasis = (n.quasis as Node[]) ?? [];
    return quasis.map((q) => (q.value as { cooked?: string; raw: string }).cooked ?? '').join('');
  }
  return null;
}

/** The literals an expression can evaluate to directly (through ?:, &&, ||, parens, casts). */
function textLiterals(n: Node): Node[] {
  switch (n.type) {
    case 'Literal':
    case 'TemplateLiteral':
      return literalText(n) === null ? [] : [n];
    case 'ConditionalExpression':
      return [...textLiterals(n.consequent as Node), ...textLiterals(n.alternate as Node)];
    case 'LogicalExpression':
      return [...textLiterals(n.left as Node), ...textLiterals(n.right as Node)];
    case 'SequenceExpression': {
      const es = n.expressions as Node[];
      return es.length > 0 ? textLiterals(es[es.length - 1]!) : [];
    }
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
      return textLiterals(n.expression as Node);
    default:
      return [];
  }
}

/**
 * The text attributes GDD §2 names. Every one of them is flagged by `jsx-attr` (which flags any
 * attribute that is not in `NON_TEXT_ATTRIBUTES`); the fixture plants one literal per name.
 */
export const TEXT_ATTRIBUTES: ReadonlySet<string> = new Set([
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'aria-placeholder',
  'title',
  'placeholder',
  'alt',
  'label',
]);

/**
 * JSX attributes and props that never hold player-visible text (GDD §2): ids and references,
 * classes, structure, ARIA references and states, and `data-*`. Every other attribute of every
 * element, DOM or component, is treated as text: a literal with 2 or more letters there is a
 * `jsx-attr` violation, so a component prop such as `name="…"` or `description="…"` cannot
 * smuggle prose past the lint. The list is short on purpose; a new non-text prop is added here,
 * in review.
 */
export const NON_TEXT_ATTRIBUTES: ReadonlySet<string> = new Set([
  'id',
  'class',
  'className',
  'key',
  'type',
  'role',
  'scope',
  'for',
  'htmlFor',
  'mode',
  'idPrefix',
  'orientation',
  // A Settings field id (`settings.ts`), e.g. `<Field setting="notation" />`.
  'setting',
  'aria-labelledby',
  'aria-controls',
  'aria-describedby',
  'aria-hidden',
  // A file input's accepted types (M4's Import from file: `.txt,text/plain`).
  'accept',
  // An input's autofill hint (M4's Hard reset field: `off`).
  'autoComplete',
]);

/** True for an attribute or prop name that is not text (`NON_TEXT_ATTRIBUTES` or `data-*`). */
export function isNonTextAttribute(name: string): boolean {
  return NON_TEXT_ATTRIBUTES.has(name) || name.startsWith('data-');
}

function attrName(n: Node): string | null {
  const name = n.name as Node | undefined;
  if (name === undefined) return null;
  if (name.type === 'JSXIdentifier') return String(name.name);
  if (name.type === 'JSXNamespacedName') {
    const ns = name.namespace as Node;
    const local = name.name as Node;
    return `${String(ns.name)}:${String(local.name)}`;
  }
  return null;
}

/**
 * The literals an attribute value (or a spread object) contributes: through `?:`, `&&`, `||`,
 * parentheses and casts, into array elements and into object property values whose key is not a
 * non-text name. Functions and calls are not entered (their arguments are computed values).
 */
function propLiterals(n: Node | null | undefined, out: Node[]): Node[] {
  if (n === null || n === undefined) return out;
  switch (n.type) {
    case 'Literal':
    case 'TemplateLiteral':
      if (literalText(n) !== null) out.push(n);
      break;
    case 'ConditionalExpression':
      propLiterals(n.consequent as Node, out);
      propLiterals(n.alternate as Node, out);
      break;
    case 'LogicalExpression':
      propLiterals(n.left as Node, out);
      propLiterals(n.right as Node, out);
      break;
    case 'SequenceExpression': {
      const es = n.expressions as Node[];
      if (es.length > 0) propLiterals(es[es.length - 1], out);
      break;
    }
    case 'JSXExpressionContainer':
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
      propLiterals(n.expression as Node, out);
      break;
    case 'ArrayExpression':
      for (const e of (n.elements as (Node | null)[]) ?? []) {
        propLiterals(e?.type === 'SpreadElement' ? (e.argument as Node) : e, out);
      }
      break;
    case 'ObjectExpression':
      for (const p of (n.properties as Node[]) ?? []) {
        if (p.type === 'SpreadElement') {
          propLiterals(p.argument as Node, out);
          continue;
        }
        const key = keyName(p);
        if (key !== null && isNonTextAttribute(key)) continue;
        propLiterals(p.value as Node, out);
      }
      break;
    default:
      break;
  }
  return out;
}

/** The declarations of a file by name (variables and functions), for resolving spreads. */
function declarations(ast: Node): Map<string, Node[]> {
  const out = new Map<string, Node[]>();
  const add = (name: string, n: Node): void => {
    out.set(name, [...(out.get(name) ?? []), n]);
  };
  walk(ast, (n) => {
    if (n.type === 'VariableDeclarator') {
      const id = n.id as Node;
      if (id.type === 'Identifier' && n.init !== null && n.init !== undefined) {
        add(String(id.name), n.init as Node);
      }
    } else if (n.type === 'FunctionDeclaration') {
      const id = n.id as Node | null;
      if (id !== null && id.type === 'Identifier') add(String(id.name), n);
    }
  });
  return out;
}

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);

/** The expressions a function can return (its nested functions are not entered). */
function returnedExpressions(fn: Node): Node[] {
  const body = fn.body as Node;
  if (body.type !== 'BlockStatement') return [body];
  const out: Node[] = [];
  const go = (n: Node): void => {
    if (n.type === 'ReturnStatement') {
      if (n.argument !== null && n.argument !== undefined) out.push(n.argument as Node);
      return;
    }
    for (const c of children(n)) if (!FUNCTIONS.has(c.type)) go(c);
  };
  go(body);
  return out;
}

/**
 * The object literals a spread argument evaluates to: an object literal, a variable whose
 * initializer is one, or a call of a function in the same file that returns one (through `?:`,
 * `&&`, `||` and casts). `null` when the lint cannot see the object: such a spread fails
 * closed (`jsx-spread`).
 */
function spreadObjects(n: Node, decls: Map<string, Node[]>, depth = 0): Node[] | null {
  if (depth > 8) return null;
  const all = (ns: readonly Node[]): Node[] | null => {
    const out: Node[] = [];
    for (const e of ns) {
      const r = spreadObjects(e, decls, depth + 1);
      if (r === null) return null;
      out.push(...r);
    }
    return out;
  };
  switch (n.type) {
    case 'ObjectExpression':
      return [n];
    case 'ConditionalExpression':
      return all([n.consequent as Node, n.alternate as Node]);
    case 'LogicalExpression':
      // `cond && {…}` spreads nothing or the object; `a || {…}` either side.
      return n.operator === '&&' ? all([n.right as Node]) : all([n.left as Node, n.right as Node]);
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
      return spreadObjects(n.expression as Node, decls, depth + 1);
    case 'Identifier': {
      const ds = decls.get(String(n.name));
      if (ds === undefined || ds.some((d) => FUNCTIONS.has(d.type))) return null;
      return all(ds);
    }
    case 'CallExpression': {
      const callee = n.callee as Node;
      if (callee.type !== 'Identifier') return null;
      const ds = decls.get(String(callee.name));
      if (ds === undefined || ds.some((d) => !FUNCTIONS.has(d.type))) return null;
      return all(ds.flatMap(returnedExpressions));
    }
    default:
      return null;
  }
}

/** Files the JSX rules read: every `.tsx`/`.jsx` under src/ except strings.ts and legal.ts. */
function jsxScope(files: readonly SourceFile[]): SourceFile[] {
  return files.filter(
    (f) =>
      f.path.startsWith('src/') &&
      /\.(tsx|jsx)$/.test(f.path) &&
      f.path !== 'src/ui/strings.ts' &&
      f.path !== 'src/ui/legal.ts',
  );
}

/** `jsx-text`, `jsx-attr` and `jsx-spread` (and `parse-error`). */
export function scanJsxStrings(files: readonly SourceFile[]): Violation[] {
  const out: Violation[] = [];
  for (const { f, ast } of parsed(jsxScope(files), out)) {
    const decls = declarations(ast);
    const flag = (lits: readonly Node[], name: string): void => {
      for (const lit of lits) {
        const text = literalText(lit) ?? '';
        if (letterCount(text) >= 2) out.push(violation(f, lit, 'jsx-attr', `${name}=${text}`));
      }
    };
    walk(ast, (n) => {
      if (n.type === 'JSXText') {
        const text = String(n.value);
        if (letterCount(text) >= 2) out.push(violation(f, n, 'jsx-text', text.trim()));
      } else if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
        for (const c of (n.children as Node[]) ?? []) {
          if (c.type !== 'JSXExpressionContainer') continue;
          for (const lit of textLiterals(c.expression as Node)) {
            const text = literalText(lit) ?? '';
            if (letterCount(text) >= 2) out.push(violation(f, lit, 'jsx-text', text));
          }
        }
      } else if (n.type === 'JSXAttribute') {
        const name = attrName(n);
        if (name !== null && isNonTextAttribute(name)) return;
        flag(propLiterals(n.value as Node | null, []), name ?? '?');
      } else if (n.type === 'JSXSpreadAttribute') {
        const objects = spreadObjects(n.argument as Node, decls);
        if (objects === null) {
          out.push(violation(f, n, 'jsx-spread', 'a spread the lint cannot resolve'));
          return;
        }
        for (const o of objects) flag(propLiterals(o, []), '...');
      }
    });
  }
  return out;
}

/** Files the `ui-words` rule reads: src/ui/**.{ts,tsx} and src/main.tsx, except strings/legal. */
function uiScope(files: readonly SourceFile[]): SourceFile[] {
  return files.filter(
    (f) =>
      (f.path.startsWith('src/ui/') || f.path === 'src/main.tsx') &&
      /\.(ts|tsx)$/.test(f.path) &&
      f.path !== 'src/ui/strings.ts' &&
      f.path !== 'src/ui/legal.ts',
  );
}

/** Two words: a run of 2 or more letters, whitespace, and another such run. */
export const WORDS = /\p{L}{2,}\s+\p{L}{2,}/u;

const CLASS_ATTRIBUTES = new Set(['class', 'className']);

/** A diagnostic that is never shown to the player: `console.*(…)`, `new …Error(…)`, `problems`. */
function isDiagnostic(n: Node): boolean {
  if (n.type === 'CallExpression') {
    const callee = n.callee as Node;
    if (callee.type !== 'MemberExpression') return false;
    const obj = callee.object as Node;
    const prop = callee.property as Node;
    if (obj.type !== 'Identifier') return false;
    if (obj.name === 'console') return true;
    return obj.name === 'problems' && prop.type === 'Identifier' && prop.name === 'push';
  }
  if (n.type === 'NewExpression') {
    const callee = n.callee as Node;
    return callee.type === 'Identifier' && String(callee.name).endsWith('Error');
  }
  return n.type === 'Property' && keyName(n) === 'problems';
}

/**
 * `ui-words`: no literal with two words (`WORDS`) anywhere in the UI code outside strings.ts and
 * legal.ts, so prose cannot hide in a module constant or a `.ts` export that a component renders
 * as `{NAME}`. Class values and diagnostics (`isDiagnostic`) are not text.
 */
export function scanUiWords(files: readonly SourceFile[]): Violation[] {
  const out: Violation[] = [];
  for (const { f, ast } of parsed(uiScope(files), out)) {
    const go = (n: Node, ancestors: readonly Node[]): void => {
      if (TYPE_ONLY.has(n.type) || isDiagnostic(n)) return;
      if (n.type === 'JSXAttribute' && CLASS_ATTRIBUTES.has(attrName(n) ?? '')) return;
      const parent = ancestors[ancestors.length - 1] ?? null;
      let text: string | null = null;
      if (n.type === 'Literal' && typeof n.value === 'string' && !isSpecifier(n, parent)) {
        text = n.value;
      } else if (n.type === 'TemplateElement') {
        text = (n.value as { cooked?: string }).cooked ?? '';
      }
      if (text !== null && WORDS.test(text)) {
        out.push(violation(f, n, 'ui-words', JSON.stringify(text)));
      }
      const next = [...ancestors, n];
      for (const c of children(n)) go(c, next);
    };
    go(ast, []);
  }
  return out;
}

/**
 * The text of every JSX text node in src/**.tsx (whitespace collapsed as JSX does), for the
 * glyph test: JSX text is not a string literal, so the tokenizer's `stringLiterals` never sees
 * it, yet a symbol such as `<span>★</span>` passes the string lint (fewer than 2 letters).
 */
export function jsxTexts(files: readonly SourceFile[]): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const errors: Violation[] = [];
  for (const { f, ast } of parsed(jsxScope(files), errors)) {
    walk(ast, (n) => {
      if (n.type !== 'JSXText') return;
      const text = String(n.value).replace(/\s+/g, ' ').trim();
      if (text !== '') out.push({ where: `${f.path}:${lineOf(f.source, n.start)}`, text });
    });
  }
  for (const e of errors) out.push({ where: `${e.file}: parse error`, text: '\u0000' });
  return out;
}

function keyName(n: Node): string | null {
  const key = n.key as Node | undefined;
  if (key === undefined || n.computed === true) return null;
  if (key.type === 'Identifier') return String(key.name);
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return null;
}

/** `content-label`: every `label:` in src/engine/content/** is a literal `strings.ts` key. */
export function scanContentLabels(
  files: readonly SourceFile[],
  isKey: (key: string) => boolean,
): Violation[] {
  const scope = files.filter((f) => f.path.startsWith('src/engine/content/'));
  const out: Violation[] = [];
  for (const { f, ast } of parsed(scope, out)) {
    walk(ast, (n) => {
      if (n.type !== 'Property' || keyName(n) !== 'label') return;
      const value = n.value as Node;
      if (n.shorthand === true) {
        out.push(violation(f, n, 'content-label', 'shorthand label'));
      } else if (value.type !== 'Literal' || typeof value.value !== 'string') {
        out.push(violation(f, n, 'content-label', `label is a ${value.type}, not a literal key`));
      } else if (!isKey(value.value)) {
        out.push(
          violation(f, n, 'content-label', `label '${value.value}' is not a strings.ts key`),
        );
      }
    });
  }
  return out;
}

/** Literals that are module specifiers, not text. */
function isSpecifier(n: Node, parent: Node | null): boolean {
  if (parent === null) return false;
  const sourceOf = [
    'ImportDeclaration',
    'ExportNamedDeclaration',
    'ExportAllDeclaration',
    'ImportExpression',
  ];
  return sourceOf.includes(parent.type) && parent.source === n;
}

const FORMAT_MODULE = 'src/engine/format.ts';

/**
 * `format-letters`: format.ts holds no word: no string literal with 2 or more letters, and no
 * single letter other than the notation's `e`.
 */
export function scanFormatLetters(files: readonly SourceFile[]): Violation[] {
  const scope = files.filter((f) => f.path === FORMAT_MODULE);
  const out: Violation[] = [];
  for (const { f, ast } of parsed(scope, out)) {
    walk(ast, (n, parent) => {
      if (n.regex !== undefined || isSpecifier(n, parent)) return;
      let texts: string[] = [];
      if (n.type === 'Literal' && typeof n.value === 'string') texts = [n.value];
      else if (n.type === 'TemplateElement') {
        texts = [(n.value as { cooked?: string }).cooked ?? ''];
      }
      for (const t of texts) {
        const letters = t.match(LETTER) ?? [];
        if (letters.length >= 2 || (letters.length === 1 && letters[0] !== 'e')) {
          out.push(violation(f, n, 'format-letters', JSON.stringify(t)));
        }
      }
    });
  }
  return out;
}

const TEMPLATE_FILLERS = new Set(['fill', 'fillParts']);

/** `template-literal`: `fill`/`fillParts` never take a literal template. */
export function scanTemplateArgs(files: readonly SourceFile[]): Violation[] {
  const scope = files.filter((f) => f.path.startsWith('src/') && /\.(ts|tsx)$/.test(f.path));
  const out: Violation[] = [];
  for (const { f, ast } of parsed(scope, out)) {
    walk(ast, (n) => {
      if (n.type !== 'CallExpression') return;
      const callee = n.callee as Node;
      if (callee.type !== 'Identifier' || !TEMPLATE_FILLERS.has(String(callee.name))) return;
      const first = ((n.arguments as Node[]) ?? [])[0];
      if (first === undefined) return;
      if (textLiterals(first).length > 0) {
        out.push(violation(f, first, 'template-literal', `${String(callee.name)}(literal)`));
      }
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// legal.ts
// ---------------------------------------------------------------------------------------------

export const LEGAL_KINDS: readonly string[] = [
  'attribution',
  'license',
  'change',
  'nonAffiliation',
];
export const MAX_LEGAL_LENGTH = 200;
/** Where quoted licence files live: a notice with a `source` quotes one of these. */
export const LICENSE_DIR = 'public/LICENSES/';

export interface LegalEntry {
  readonly kind: string;
  readonly subject: string;
  readonly text: string;
  readonly source?: string;
}

/** Whitespace collapsed to single spaces (the GDD wraps its quoted lines). */
const collapse = (s: string): string => s.replace(/\s+/g, ' ');

/**
 * `legal-*` (GDD §2): every notice is at most 200 characters and of a declared kind, and its
 * text comes from one of two places:
 * - a licence file: `source` is a file under `public/LICENSES/` and the text is a verbatim
 *   substring of it (`license` notices always have a source: a licence name is quoted from its
 *   licence text);
 * - the GDD: a notice with no source (the OEIS card line and non-affiliation line of §16.1, the
 *   icon credit line of §16.2) is exactly a line the GDD fixes in double quotes, `{placeholders}`
 *   included. `fixed` is that GDD text.
 *
 * `read(path)` returns a repo file's text, or null when it does not exist.
 */
export function checkLegal(
  notices: readonly LegalEntry[],
  read: (path: string) => string | null,
  fixed: string,
  file: string,
): Violation[] {
  const out: Violation[] = [];
  const bad = (rule: string, n: LegalEntry, why: string): void => {
    out.push({ file, line: 0, rule, text: `${n.subject}: ${why}: ${n.text}` });
  };
  const gdd = collapse(fixed);
  for (const n of notices) {
    if (codePoints(n.text) > MAX_LEGAL_LENGTH) bad('legal-length', n, 'over 200 characters');
    if (!LEGAL_KINDS.includes(n.kind)) bad('legal-kind', n, `unknown kind ${n.kind}`);
    if (n.source === undefined) {
      if (n.kind === 'license') bad('legal-source', n, 'a licence notice needs its licence file');
      else if (!gdd.includes(`"${collapse(n.text)}"`)) {
        bad('legal-fixed', n, 'no source, and not a line the GDD fixes');
      }
      continue;
    }
    if (!n.source.startsWith(LICENSE_DIR) || n.source.includes('..')) {
      bad('legal-source', n, `${n.source} is not under ${LICENSE_DIR}`);
      continue;
    }
    const text = read(n.source);
    if (text === null) bad('legal-source', n, `${n.source} does not exist`);
    else if (!text.includes(n.text)) bad('legal-verbatim', n, `not quoted from ${n.source}`);
  }
  return out;
}

/** GDD §16 (open assets), where the fixed notices are quoted. */
export function gddSection16(gdd: string): string {
  const start = gdd.indexOf('\n## 16. ');
  const end = gdd.indexOf('\n## 17. ');
  if (start < 0 || end < start) throw new Error('GDD §16 not found');
  return gdd.slice(start, end);
}
