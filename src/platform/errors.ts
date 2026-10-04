/**
 * Errors and recovery (GDD §21.8). One hub collects faults; the game loop pauses on the first
 * one and the UI opens the recovery panel.
 *
 * - `safeTick` wraps every call into the engine: an exception, or a failed invariant check of
 *   the result, is reported and the call returns `null`.
 * - `installGlobalHandlers` reports uncaught errors and unhandled rejections (the GDD's
 *   `window.onerror`). It uses `addEventListener`, so other listeners keep working.
 * - Render errors are not faults: a tab's error boundary (`src/ui/Recovery.tsx`) replaces only
 *   that tab, and the engine keeps running.
 */

export type FaultKind = 'tick' | 'invariant' | 'view' | 'error' | 'rejection';

export interface Fault {
  readonly kind: FaultKind;
  readonly error?: unknown;
  /** The failed invariants (`kind: 'invariant'`). */
  readonly problems?: readonly string[];
}

export interface ErrorHub {
  /** The first fault reported, or `null`. */
  readonly fault: Fault | null;
  /** Records a fault. Only the first one is kept and announced; later ones are ignored. */
  report(f: Fault): void;
  /** Calls `l` when the first fault is reported. Returns the unsubscribe function. */
  subscribe(l: (f: Fault) => void): () => void;
}

export interface ErrorHubOptions {
  /** Called once with the first fault, before the listeners (for example to log it). */
  readonly onFault?: (f: Fault) => void;
}

export function createErrorHub(opts: ErrorHubOptions = {}): ErrorHub {
  let fault: Fault | null = null;
  const listeners = new Set<(f: Fault) => void>();
  return {
    get fault() {
      return fault;
    },
    report(f) {
      if (fault !== null) return;
      fault = f;
      try {
        opts.onFault?.(f);
      } catch {
        // logging must never stop the listeners
      }
      for (const l of [...listeners]) {
        try {
          l(f);
        } catch {
          // one failing listener must not stop the others
        }
      }
    },
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

/**
 * Runs `run` and checks its result. An exception is reported as `tick`, failed invariants as
 * `invariant`; both return `null`, so the caller keeps its last good value.
 */
export function safeTick<T>(
  hub: ErrorHub,
  run: () => T,
  check: (v: T) => readonly string[],
  kind: 'tick' | 'view' = 'tick',
): T | null {
  let v: T;
  try {
    v = run();
  } catch (error) {
    hub.report({ kind, error });
    return null;
  }
  let problems: readonly string[];
  try {
    problems = check(v);
  } catch (error) {
    hub.report({ kind, error });
    return null;
  }
  if (problems.length > 0) {
    hub.report({ kind: 'invariant', problems });
    return null;
  }
  return v;
}

/**
 * Reports uncaught errors (`error` events) and unhandled rejections to the hub. Returns a
 * function that removes the handlers.
 */
export function installGlobalHandlers(win: Window, hub: ErrorHub): () => void {
  const onError = (e: ErrorEvent): void => {
    hub.report({ kind: 'error', error: e.error ?? e.message });
  };
  const onRejection = (e: PromiseRejectionEvent): void => {
    hub.report({ kind: 'rejection', error: e.reason });
  };
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  return () => {
    win.removeEventListener('error', onError);
    win.removeEventListener('unhandledrejection', onRejection);
  };
}
