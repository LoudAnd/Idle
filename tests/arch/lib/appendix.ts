// The Appendix C parser and the template rules (GDD §2, Appendix C; `templates.test.ts`).
//
// Appendix C lists every canonical template as a table row `| \`id\` | \`template\` |`. One row
// is a range, `` `power.slots12` … `power.slots78` ``, which stands for the four slot pairs
// slots12, slots34, slots56 and slots78 (§8.4). Parsing fails closed: every line of the section
// that starts with "| `" must parse as a row.
import type { Violation } from './scan.ts';

export interface AppendixRow {
  readonly ids: readonly string[];
  readonly template: string;
  /** 1-based line in the GDD. */
  readonly line: number;
}

export interface Appendix {
  readonly rows: readonly AppendixRow[];
  /** Lines of the section that start with "| `" (each must be a parsed row). */
  readonly tableLines: number;
  /** id → template. */
  readonly templates: ReadonlyMap<string, string>;
}

const ROW = /^\|\s*(.+?)\s*\|\s*`(.*)`\s*\|\s*$/;
const ID = /`([^`]+)`/g;
const RANGE_END = /^(.*?)(\d)(\d)$/;

/** `power.slots12` … `power.slots78` → slots12, slots34, slots56, slots78. */
export function expandRange(a: string, b: string): string[] {
  const ma = RANGE_END.exec(a);
  const mb = RANGE_END.exec(b);
  if (!ma || !mb || ma[1] !== mb[1]) throw new Error(`not a range: ${a} … ${b}`);
  const from = Number(ma[2]);
  const width = Number(ma[3]) - from + 1;
  const to = Number(mb[2]);
  if (!(width >= 1) || (to - from) % width !== 0 || Number(mb[3]) !== to + width - 1) {
    throw new Error(`not a range: ${a} … ${b}`);
  }
  const out: string[] = [];
  for (let i = from; i <= to; i += width) out.push(`${ma[1]}${i}${i + width - 1}`);
  return out;
}

/** The Appendix C section of the GDD: from its heading to the next `## ` heading. */
export function appendixSection(md: string): { text: string; firstLine: number } {
  const start = md.indexOf('\n## Appendix C');
  if (start < 0) throw new Error('no Appendix C');
  const end = md.indexOf('\n## ', start + 1);
  const text = md.slice(start + 1, end < 0 ? md.length : end);
  return { text, firstLine: md.slice(0, start + 1).split('\n').length };
}

export function parseAppendixC(md: string): Appendix {
  const { text, firstLine } = appendixSection(md);
  const rows: AppendixRow[] = [];
  let tableLines = 0;
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.startsWith('| `')) return;
    tableLines++;
    const m = ROW.exec(line);
    if (!m) return;
    const ids = [...m[1]!.matchAll(ID)].map((x) => x[1]!);
    let expanded: string[];
    if (ids.length === 1) expanded = ids;
    else if (ids.length === 2 && m[1]!.includes('…')) expanded = expandRange(ids[0]!, ids[1]!);
    else return;
    rows.push({ ids: expanded, template: m[2]!, line: firstLine + i });
  });
  const templates = new Map<string, string>();
  for (const r of rows) for (const id of r.ids) templates.set(id, r.template);
  return { rows, tableLines, templates };
}

/** The namespaces of Appendix C ids: a strings.ts key in one of them must be an Appendix C id. */
export const APPENDIX_NAMESPACES = [
  'product.',
  'power.',
  'challenge.',
  'tower.',
  'record.',
  'slot.',
  'lab.',
  'auto.',
  'exponent.',
  'ach.',
] as const;

/**
 * Every `templateId` in a tree of content values (the exported tables of
 * `src/engine/content/*.ts`), with where it was found.
 */
export function contentTemplateIds(value: unknown, path: string): { id: string; path: string }[] {
  const out: { id: string; path: string }[] = [];
  const seen = new Set<object>();
  const walk = (v: unknown, p: string): void => {
    if (typeof v !== 'object' || v === null || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      v.forEach((e, i) => walk(e, `${p}[${i}]`));
      return;
    }
    const rec = v as Record<string, unknown>;
    if (typeof rec.templateId === 'string') out.push({ id: rec.templateId, path: p });
    for (const [k, e] of Object.entries(rec)) walk(e, `${p}.${k}`);
  };
  walk(value, path);
  return out;
}

function v(file: string, rule: string, text: string): Violation {
  return { file, line: 0, rule, text };
}

/**
 * `content-template`: every content `templateId` is an Appendix C id, and `strings.ts` holds
 * exactly its template under that id.
 */
export function checkContentTemplates(
  ids: readonly { id: string; path: string }[],
  appendix: Appendix,
  strings: Readonly<Record<string, string>>,
  file: string,
): Violation[] {
  const out: Violation[] = [];
  for (const { id, path } of ids) {
    const want = appendix.templates.get(id);
    if (want === undefined)
      out.push(v(file, 'content-template', `${path}: ${id} is not in Appendix C`));
    else if (strings[id] !== want) {
      out.push(v(file, 'content-template', `${path}: strings['${id}'] is not '${want}'`));
    }
  }
  return out;
}

/**
 * `strings-template`: every strings.ts key that is an Appendix C id holds exactly its template.
 * `stray-template`: a key in an Appendix C namespace must be an Appendix C id.
 */
export function checkStringTemplates(
  strings: Readonly<Record<string, string>>,
  appendix: Appendix,
  file: string,
): Violation[] {
  const out: Violation[] = [];
  for (const [key, text] of Object.entries(strings)) {
    const want = appendix.templates.get(key);
    if (want !== undefined) {
      if (text !== want)
        out.push(v(file, 'strings-template', `${key}: '${text}' is not '${want}'`));
    } else if (APPENDIX_NAMESPACES.some((ns) => key.startsWith(ns))) {
      out.push(v(file, 'stray-template', `${key} is in an Appendix C namespace but not listed`));
    }
  }
  return out;
}

/**
 * The reverse direction, per shipped section (GDD §2): once a milestone ships a section (M5:
 * `product.`), every Appendix C id in it has its strings.ts entry.
 */
export function checkShippedSections(
  sections: readonly string[],
  appendix: Appendix,
  strings: Readonly<Record<string, string>>,
  file: string,
): Violation[] {
  const out: Violation[] = [];
  for (const [id] of appendix.templates) {
    if (!sections.some((s) => id.startsWith(s))) continue;
    if (!(id in strings)) out.push(v(file, 'shipped-template', `${id} has no strings.ts entry`));
  }
  return out;
}
