// Planted: string-literal text attributes with 2 or more letters. One per text attribute GDD §2
// names, then component props, a prop holding an object literal, and spread objects (literal,
// through a variable and through a function in the same file).
declare function Card(p: Record<string, unknown>): null;
declare function Tabs(p: Record<string, unknown>): null;

const PANEL = { id: 'p', 'aria-label': 'Panel name' };
const panel = (on: boolean) => (on ? { 'aria-label': 'Open panel' } : { title: 'Closed panel' });

export function Planted({ on }: { on: boolean }) {
  return (
    <div>
      <button type="button" aria-label="Buy generator" />
      <p aria-description="Some description" />
      <p aria-roledescription="Slide deck" />
      <p aria-valuetext={'Half done'} />
      <p aria-placeholder="Type here" />
      <span title={'Hello'} />
      <input placeholder="Search" />
      <img alt="Picture" />
      <option label="Choice" />
      <Card name="Quantum Forge" description={on ? 'Forged in a star' : 'Cold'} />
      <Tabs items={[{ id: 'x', label: 'The Archive of Lost Sums' }]} />
      <section {...{ 'aria-label': 'Ancient tome of numbers' }} />
      <section {...PANEL} />
      <section {...panel(on)} />
    </div>
  );
}
