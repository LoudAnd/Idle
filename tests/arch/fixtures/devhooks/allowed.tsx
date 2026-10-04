// Negative control: the dev hooks imported dynamically inside the environment guard (main.tsx).
export async function boot(): Promise<void> {
  if (import.meta.env.DEV || import.meta.env.VITE_DEV_HOOKS === '1') {
    const hooks = await import('./platform/devhooks.ts');
    hooks.markDevHooks(document);
  }
}
