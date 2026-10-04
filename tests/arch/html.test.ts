// @vitest-environment node
// ROADMAP M3, GDD §1, §17.6: index.html's title is the game's title, and the page starts in
// the default theme with safe-area insets available.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STRINGS } from '../../src/ui/strings.ts';
import { REPO_ROOT } from './lib/scan.ts';

const html = readFileSync(join(REPO_ROOT, 'index.html'), 'utf8');

describe('index.html', () => {
  it('the title is "Integer Sequence Idle"', () => {
    const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
    expect(titles).toEqual(['Integer Sequence Idle']);
    // The page's visually hidden h1 (GDD §18) is the same title, from strings.ts.
    expect(STRINGS['game.title']).toBe(titles[0]);
  });

  it('starts dark (no theme flash), declares both colour schemes and viewport-fit=cover', () => {
    expect(html).toMatch(/<html lang="en" data-theme="dark">/);
    expect(html).toMatch(/<meta name="color-scheme" content="dark light" \/>/);
    expect(html).toMatch(/viewport-fit=cover/);
  });
});
