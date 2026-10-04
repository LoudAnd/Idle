// Planted: JSX text literals with 2 or more letters, as text and as a child expression (also in
// the branches of ?:, && and ||, and as a static template).
export function Planted({ on, label }: { on: boolean; label: string }) {
  return (
    <div>
      <p>Buy now</p>
      <p>{'Buy now'}</p>
      <p>{on ? 'Ready' : null}</p>
      <p>{on && 'Ready'}</p>
      <p>{label || 'Fallback'}</p>
      <p>{`Buy now`}</p>
    </div>
  );
}
