// A dynamic import outside the guard still ships the hooks' chunk in production.
export async function boot(): Promise<void> {
  const hooks = await import('./platform/devhooks.ts');
  if (import.meta.env.DEV) hooks.markDevHooks(document);
}
