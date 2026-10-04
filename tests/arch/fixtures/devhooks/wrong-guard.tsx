// A guard on something else does not keep the hooks out of production.
export async function boot(debug: boolean): Promise<void> {
  if (debug) {
    const hooks = await import('./platform/devhooks.ts');
    hooks.markDevHooks(document);
  }
}
