// @vitest-environment node
// GDD §2, Appendix C: canonical templates. Every content id with a `templateId` has exactly its
// Appendix C template in strings.ts; every strings.ts key that is an Appendix C id holds exactly
// its template (`slot.term` from M3); no strings.ts key in an Appendix C namespace is missing
// from the appendix. Each rule is proven against a planted fixture. The reverse direction
// (every Appendix C row has its entry) applies per shipped section: none in M3, Product from M5.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STRINGS } from '../../src/ui/strings.ts';
import {
  checkContentTemplates,
  checkShippedSections,
  checkStringTemplates,
  contentTemplateIds,
  expandRange,
  parseAppendixC,
} from './lib/appendix.ts';
import { REPO_ROOT, describeViolations } from './lib/scan.ts';
import { checkEntries, stringLeaves } from './lib/strings.ts';

const GDD = readFileSync(join(REPO_ROOT, 'docs', 'GAME_DESIGN.md'), 'utf8');
const appendix = parseAppendixC(GDD);
/** Sections whose content has shipped (M5 adds `product.`). */
const SHIPPED_SECTIONS: readonly string[] = [];

async function importFile(...parts: string[]): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(join(REPO_ROOT, ...parts)).href)) as Record<string, unknown>;
}

/** Every templateId in the exported values of src/engine/content/*.ts. */
async function contentIds(): Promise<{ id: string; path: string }[]> {
  const dir = join(REPO_ROOT, 'src', 'engine', 'content');
  const out: { id: string; path: string }[] = [];
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith('.ts'))
    .sort()) {
    const mod = await importFile('src', 'engine', 'content', name);
    for (const [k, v] of Object.entries(mod)) out.push(...contentTemplateIds(v, `${name}:${k}`));
  }
  return out;
}

const rules = (vs: readonly { rule: string }[]) => vs.map((v) => v.rule);

describe('Appendix C (GDD §2)', () => {
  it('parses every Appendix C row (the slot range expanded to its four ids)', () => {
    expect(appendix.rows).toHaveLength(appendix.tableLines); // fail closed: no row skipped
    // Not vacuous, without pinning counts that every content milestone changes.
    expect(appendix.rows.length).toBeGreaterThanOrEqual(98);
    expect(appendix.templates.size).toBeGreaterThan(appendix.rows.length); // a range row adds ids
    expect(appendix.templates.get('product.u1')).toBe('start x = 1e4');
    expect(appendix.templates.get('slot.term')).toBe('term {i} of {N}');
    expect(appendix.templates.get('power.slots56')).toBe('Slots G{a}–G{b}');
    expect(appendix.templates.get('ach.r8')).toBe('Exhaust {n} Records');
  });

  it('the slot range expands to the four slot pairs', () => {
    expect(expandRange('power.slots12', 'power.slots78')).toEqual([
      'power.slots12',
      'power.slots34',
      'power.slots56',
      'power.slots78',
    ]);
    expect(() => expandRange('power.slots12', 'tower.x78')).toThrow();
  });

  it('every content templateId matches its template', async () => {
    const ids = await contentIds();
    const vs = checkContentTemplates(ids, appendix, STRINGS, 'src/engine/content');
    expect(vs, describeViolations(vs)).toEqual([]);
    // M3's content (the Sum base factors) has no templateId (§21.3), so this guard is in place
    // for M5's Product upgrades; the walk itself finds planted ids (below). Every id found is an
    // Appendix C id.
    for (const { id } of ids) expect(appendix.templates.has(id), id).toBe(true);
  });

  it('slot.term matches Appendix C, and no strings.ts key is a stray template', () => {
    const vs = checkStringTemplates(STRINGS, appendix, 'src/ui/strings.ts');
    expect(vs, describeViolations(vs)).toEqual([]);
    const listed = Object.keys(STRINGS).filter((k) => appendix.templates.has(k));
    expect(listed).toContain('slot.term'); // the rule is not vacuous
  });

  it('every row of a shipped section has its strings.ts entry (none shipped in M3)', () => {
    expect(checkShippedSections(SHIPPED_SECTIONS, appendix, STRINGS, 'src/ui/strings.ts')).toEqual(
      [],
    );
    // Shipping a section without its entries fails, once per row of that section:
    const productRows = [...appendix.templates.keys()].filter((id) => id.startsWith('product.'));
    expect(productRows.length).toBeGreaterThan(0);
    expect(checkShippedSections(['product.'], appendix, {}, 'x')).toHaveLength(productRows.length);
  });

  it('forward guard: every Appendix C template passes the string lint', () => {
    const table = Object.fromEntries(appendix.templates);
    const vs = checkEntries(stringLeaves(table, 'AppendixC'), 'docs/GAME_DESIGN.md');
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it('flags a planted mismatch, unknown id and stray key', async () => {
    const mismatch = (await importFile('tests', 'arch', 'fixtures', 'templates', 'mismatch.ts'))
      .STRINGS as Record<string, string>;
    expect(rules(checkStringTemplates(mismatch, appendix, 'mismatch.ts'))).toEqual([
      'strings-template',
    ]);
    // ... and the same entry through content: a templateId whose strings.ts text differs.
    expect(
      rules(checkContentTemplates([{ id: 'product.u1', path: 'x' }], appendix, mismatch, 'x')),
    ).toEqual(['content-template']);

    const unknown = await importFile('tests', 'arch', 'fixtures', 'templates', 'unknown-id.ts');
    const ids = contentTemplateIds(unknown.CONTENT, 'CONTENT');
    expect(ids).toEqual([{ id: 'product.u999', path: 'CONTENT[0]' }]);
    expect(
      rules(checkContentTemplates(ids, appendix, unknown.STRINGS as Record<string, string>, 'x')),
    ).toEqual(['content-template']);

    const stray = (await importFile('tests', 'arch', 'fixtures', 'templates', 'stray-key.ts'))
      .STRINGS as Record<string, string>;
    expect(rules(checkStringTemplates(stray, appendix, 'stray-key.ts'))).toEqual([
      'stray-template',
    ]);
  });
});
