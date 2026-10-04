// Negative control: everything here is allowed by the JSX rules.
import { STRINGS } from '../../../../src/ui/strings.ts';

const SEP = ' · ';
const PANEL = { id: 'sum-panel', role: 'region', 'aria-labelledby': 'a b' };
const named = (on: boolean) => (on ? { 'aria-label': STRINGS['tab.sum'] } : { id: 'x' });

declare function Field(p: Record<string, unknown>): null;
declare function Tabs(p: Record<string, unknown>): null;

export function Allowed({ n, on }: { n: number; on: boolean }) {
  return (
    <div class="sum-tab row silhouette" id="sum-panel" data-tab="sum" role="region">
      <p aria-label={STRINGS['tab.sum']} aria-labelledby="a b" title={STRINGS['sum.max']}>
        {STRINGS['sum.buy1']}
        {SEP}
        {' = '}
        {'x'}
        {`${n}`}
        <span>×</span>
        <span>1/10</span>
      </p>
      <input type="number" placeholder={String(n)} />
      <Field setting="notation" data-mode="maxAll" />
      <Tabs
        items={[{ id: 'numbers', label: STRINGS['settings.numbers'] }]}
        orientation="vertical"
      />
      <section {...PANEL} />
      <section {...named(on)} />
      <span aria-hidden="true" style={{ width: `${n}%` }} />
    </div>
  );
}
