// GDD §17.2, §18 (jsdom): the WAI-ARIA tablist: roving tabindex, arrow keys, Home/End,
// automatic activation, the dot badge, and nothing at all for fewer than 2 tabs.
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { Tabs, panelId, tabId } from '../../src/ui/shell/Tabs.tsx';
import type { TabItem } from '../../src/ui/shell/Tabs.tsx';
import { STRINGS } from '../../src/ui/strings.ts';

afterEach(() => cleanup());

const ITEMS: TabItem[] = [
  { id: 'a', label: STRINGS['tab.sum'] },
  { id: 'b', label: STRINGS['settings.numbers'], badge: true },
  { id: 'c', label: STRINGS['settings.display'] },
];

function Harness({ items = ITEMS }: { items?: TabItem[] }) {
  const [sel, setSel] = useState('a');
  return (
    <div>
      <Tabs
        items={items}
        selected={sel}
        onSelect={setSel}
        label={STRINGS['tabs.label']}
        idPrefix="t"
      />
      <p data-selected>{sel}</p>
    </div>
  );
}

const tabs = () => screen.getAllByRole('tab') as HTMLButtonElement[];
const selected = (c: Element) => c.querySelector('[data-selected]')?.textContent;

describe('Tabs (WAI-ARIA tablist)', () => {
  it('renders nothing for fewer than 2 items', () => {
    const { container } = render(<Harness items={[ITEMS[0]!]} />);
    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });

  it('tabs have roles, ids, aria-selected, aria-controls and a roving tabindex', () => {
    render(<Harness />);
    const list = screen.getByRole('tablist', { name: STRINGS['tabs.label'] });
    expect(list).toBeTruthy();
    expect(tabs().map((t) => t.id)).toEqual(['a', 'b', 'c'].map((i) => tabId('t', i)));
    expect(tabs().map((t) => t.getAttribute('aria-controls'))).toEqual(
      ['a', 'b', 'c'].map((i) => panelId('t', i)),
    );
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it('arrows move and select (wrapping), Home and End jump', () => {
    const { container } = render(<Harness />);
    tabs()[0]!.focus();
    fireEvent.keyDown(tabs()[0]!, { key: 'ArrowRight' });
    expect(selected(container)).toBe('b');
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(tabs()[1]!, { key: 'ArrowDown' });
    expect(selected(container)).toBe('c');
    fireEvent.keyDown(tabs()[2]!, { key: 'ArrowRight' });
    expect(selected(container)).toBe('a'); // wraps
    fireEvent.keyDown(tabs()[0]!, { key: 'ArrowLeft' });
    expect(selected(container)).toBe('c');
    fireEvent.keyDown(tabs()[2]!, { key: 'Home' });
    expect(selected(container)).toBe('a');
    fireEvent.keyDown(tabs()[0]!, { key: 'End' });
    expect(selected(container)).toBe('c');
    expect(document.activeElement).toBe(tabs()[2]);
    fireEvent.keyDown(tabs()[2]!, { key: 'ArrowUp' });
    expect(selected(container)).toBe('b');
  });

  it('a click selects; the badge is a dot with a visually hidden "new"', () => {
    const { container } = render(<Harness />);
    fireEvent.click(tabs()[2]!);
    expect(selected(container)).toBe('c');
    const b = tabs()[1]!;
    expect(b.hasAttribute('data-badge')).toBe(true);
    expect(b.querySelector('.sr-only')?.textContent).toBe(STRINGS['tab.new']);
    expect(tabs()[0]!.hasAttribute('data-badge')).toBe(false);
  });
});
