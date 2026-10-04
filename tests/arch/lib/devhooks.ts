// The dev-hook guards (GDD §21.9): the hooks reach a build only through main.tsx's dynamic
// import inside `if (import.meta.env.DEV || import.meta.env.VITE_DEV_HOOKS === '1')`, which Vite
// removes from a production build, and the marker string the bundle test greps for exists only
// in src/platform/devhooks.ts (so that test can neither pass nor fail by accident).
import { parseAst } from 'vite';
import type { SourceFile, Violation } from './scan.ts';

export const MARKER = 'isi-dev-hooks';
export const HOOKS_FILE = 'src/platform/devhooks.ts';
export const ENTRY = 'src/main.tsx';
/** The guard, exactly as main.tsx writes it. */
export const GUARD = "import.meta.env.DEV || import.meta.env.VITE_DEV_HOOKS === '1'";

interface Node {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
}

const isNode = (v: unknown): v is Node =>
  typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';

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

const lineOf = (source: string, at: number) => source.slice(0, at).split('\n').length;

function specifier(n: Node): string | null {
  const s = n.source;
  return isNode(s) && s.type === 'Literal' && typeof s.value === 'string' ? s.value : null;
}

const isHooks = (spec: string | null) => spec !== null && /(^|\/)devhooks(\.ts)?$/.test(spec);

/** `devhooks-marker` and `devhooks-import` violations of these files. */
export function scanDevHooks(files: readonly SourceFile[]): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    if (f.path !== HOOKS_FILE && f.source.includes(MARKER)) {
      const at = f.source.indexOf(MARKER);
      out.push({ file: f.path, line: lineOf(f.source, at), rule: 'devhooks-marker', text: MARKER });
    }
    if (!f.source.includes('devhooks')) continue;
    let ast: Node;
    try {
      const parsed = parseAst(f.source, { lang: f.path.endsWith('x') ? 'tsx' : 'ts' }) as unknown;
      if (!isNode(parsed)) throw new Error('no AST');
      ast = parsed;
    } catch (e) {
      out.push({ file: f.path, line: 0, rule: 'parse-error', text: String(e) });
      continue;
    }
    const go = (n: Node, ancestors: readonly Node[]): void => {
      const decl =
        n.type === 'ImportDeclaration' ||
        n.type === 'ExportNamedDeclaration' ||
        n.type === 'ExportAllDeclaration';
      if (decl && isHooks(specifier(n))) {
        out.push({
          file: f.path,
          line: lineOf(f.source, n.start),
          rule: 'devhooks-import',
          text: 'a static import of devhooks.ts',
        });
      }
      if (n.type === 'ImportExpression' && isHooks(specifier(n))) {
        const guarded = ancestors.some(
          (a, i) =>
            a.type === 'IfStatement' &&
            isNode(a.test) &&
            f.source.slice(a.test.start, a.test.end) === GUARD &&
            (ancestors[i + 1] ?? n) === a.consequent,
        );
        if (f.path !== ENTRY || !guarded) {
          out.push({
            file: f.path,
            line: lineOf(f.source, n.start),
            rule: 'devhooks-import',
            text: f.path !== ENTRY ? 'imported outside main.tsx' : 'imported outside the guard',
          });
        }
      }
      for (const c of children(n)) go(c, [...ancestors, n]);
    };
    go(ast, []);
  }
  return out;
}
