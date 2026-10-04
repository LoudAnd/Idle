// Planted: a spread the lint cannot resolve to object literals fails closed (jsx-spread).
export function Planted(props: Record<string, unknown>) {
  return <section {...props} />;
}
