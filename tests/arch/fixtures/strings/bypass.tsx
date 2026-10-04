// Planted: the routes the M3 review found around the first string lint. A literal passed to a
// component prop, a spread object, an object literal in a prop, and a module constant rendered
// as {NAME} (caught by ui-words, since the JSX rules cannot follow an identifier).
declare function Card(p: Record<string, unknown>): null;
declare function Tabs(p: Record<string, unknown>): null;

const NAME = 'Quantum Forge';

export function Planted() {
  return (
    <div>
      <section {...{ 'aria-label': 'Ancient tome of numbers' }} />
      <Card name="Quantum Forge" description="Forged in the heart of a dying star." />
      <Tabs items={[{ id: 'x', label: 'The Archive of Lost Sums' }]} />
      <p>{NAME}</p>
    </div>
  );
}
