/**
 * `strings.ts` templates (GDD §2): `{name}` placeholders filled from data. Unknown placeholders
 * stay as they are.
 */
const PLACEHOLDER = /\{(\w+)\}/g;

/** Fills a template with text: `fill('Generator {k}', { k: 3 })` is `Generator 3`. */
export function fill(template: string, params: Readonly<Record<string, string | number>>): string {
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const v = params[name];
    return v === undefined ? whole : String(v);
  });
}

/**
 * Splits a template into its text and filled parts, so a placeholder can be a component (such
 * as `<Num>`): `fillParts('{b} bought', { b: node })` is `[node, ' bought']`.
 */
export function fillParts<T>(
  template: string,
  params: Readonly<Record<string, T>>,
): (string | T)[] {
  const out: (string | T)[] = [];
  let at = 0;
  for (const m of template.matchAll(PLACEHOLDER)) {
    const v = params[m[1] ?? ''];
    if (v === undefined) continue;
    const start = m.index ?? 0;
    if (start > at) out.push(template.slice(at, start));
    out.push(v);
    at = start + m[0].length;
  }
  if (at < template.length) out.push(template.slice(at));
  return out;
}
