// @vitest-environment node
// GDD §18: text contrast ≥ 4.5:1 and UI contrast ≥ 3:1, computed from the theme tokens of
// src/ui/theme.css (WCAG 2.x relative luminance), for every theme. GDD §17.3: dimming never
// takes enabled text below 4.5:1, so the silhouette's opacity (read from SumTab.css) is
// applied to its text before the check.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(join(__dirname, '..', '..', 'src', 'ui', 'theme.css'), 'utf8');
const SUM_CSS = readFileSync(join(__dirname, '..', '..', 'src', 'ui', 'sum', 'SumTab.css'), 'utf8');

/** The custom properties of the rule whose selector list contains `selector`. */
function tokens(selector: string): Record<string, string> {
  const body = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of body.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = m[1]!.split(',').map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    const out: Record<string, string> = {};
    for (const d of m[2]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim();
    return out;
  }
  throw new Error(`no rule for ${selector}`);
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1]!.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16)) as [number, number, number];
}

/** `fg` drawn at opacity `alpha` over `bg` (sRGB compositing, as browsers do), as #rrggbb. */
function blend(fg: string, bg: string, alpha: number): string {
  const f = rgb(fg);
  const b = rgb(bg);
  return `#${f
    .map((c, i) => Math.round(alpha * c + (1 - alpha) * b[i]!))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** The `opacity` of the rule whose selector is `selector` in a stylesheet. */
function opacityOf(css: string, selector: string): number {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of body.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (m[1]!.trim() !== selector) continue;
    const o = /(?:^|;)\s*opacity\s*:\s*([\d.]+)\s*;/.exec(m[2]!);
    if (o) return Number(o[1]);
  }
  throw new Error(`no opacity for ${selector}`);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = {
  dark: tokens(":root[data-theme='dark']"),
  light: tokens(":root[data-theme='light']"),
};
const BACKGROUNDS = ['--bg', '--surface', '--surface-2'];
const TEXT = ['--text', '--text-muted'];
const UI = ['--border', '--accent', '--focus', '--ok'];

describe('theme contrast (GDD §18)', () => {
  it('the default (:root) is the dark theme', () => {
    expect(tokens(':root')).toEqual(THEMES.dark);
  });

  it.each(Object.entries(THEMES))(
    '%s: text ≥ 4.5:1 and UI ≥ 3:1 on every background',
    (_name, t) => {
      for (const bg of BACKGROUNDS) {
        for (const fg of TEXT) {
          expect(contrast(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
        for (const fg of UI) {
          expect(contrast(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
        }
      }
    },
  );

  it('both themes define the same tokens', () => {
    expect(Object.keys(THEMES.light).sort()).toEqual(Object.keys(THEMES.dark).sort());
    expect(Object.keys(THEMES.dark).sort()).toEqual([...BACKGROUNDS, ...TEXT, ...UI].sort());
  });

  it.each(Object.entries(THEMES))(
    '%s: a silhouette’s enabled text stays ≥ 4.5:1 at its opacity (GDD §17.3)',
    (_name, t) => {
      const alpha = opacityOf(SUM_CSS, '.sum-table .silhouette');
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1); // it is dimmed
      // Silhouette rows sit on the page background; their Buy 1 is transparent and muted.
      for (const fg of TEXT) {
        const shown = blend(t[fg]!, t['--bg']!, alpha);
        expect(contrast(shown, t['--bg']!), `${fg} at ${alpha}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('the blend is not vacuous: half opacity would fail the light theme', () => {
    const t = THEMES.light;
    expect(contrast(blend(t['--text-muted']!, t['--bg']!, 0.5), t['--bg']!)).toBeLessThan(4.5);
    expect(blend('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
