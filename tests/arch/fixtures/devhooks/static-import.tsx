// A static import would put the hooks into every build.
import { readDevHooks } from './platform/devhooks.ts';

export const hooks = readDevHooks(window.location.search);
