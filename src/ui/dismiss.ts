/**
 * Dismissable layers (GDD §17.4, §18: "Escape | Close"): the open panels that close on Escape,
 * such as the Breakdown and Settings, and later the While-away modal, the confirmations and the
 * hotkey list. Layers form a stack in the order they open, and only the topmost one handles a
 * key or a pointer press outside it, so one Escape closes one panel: Escape in Settings, opened
 * over an open breakdown, closes Settings and leaves the breakdown open beneath it.
 *
 * One `keydown` and one `pointerdown` listener on the document serve the whole stack; they are
 * installed with the first layer and removed with the last.
 */
import { useLayoutEffect, useRef } from 'preact/hooks';

export interface DismissLayer {
  /** Escape was pressed while this layer was on top. */
  readonly onEscape: () => void;
  /** A pointer was pressed while this layer was on top (it decides whether that was outside). */
  readonly onPointerDown?: (target: EventTarget | null) => void;
}

const stack: DismissLayer[] = [];
let doc: Document | null = null;

function top(): DismissLayer | undefined {
  return stack[stack.length - 1];
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.isComposing) return;
  top()?.onEscape();
}

function onPointer(e: Event): void {
  top()?.onPointerDown?.(e.target);
}

/** Puts a layer on top of the stack. Returns the function that removes it (wherever it is). */
export function pushLayer(d: Document, layer: DismissLayer): () => void {
  if (doc === null) {
    doc = d;
    d.addEventListener('keydown', onKey);
    d.addEventListener('pointerdown', onPointer);
  }
  stack.push(layer);
  return () => {
    const i = stack.lastIndexOf(layer);
    if (i >= 0) stack.splice(i, 1);
    if (stack.length === 0 && doc !== null) {
      doc.removeEventListener('keydown', onKey);
      doc.removeEventListener('pointerdown', onPointer);
      doc = null;
    }
  };
}

/** The number of open layers (for tests). */
export function layerCount(): number {
  return stack.length;
}

/**
 * Keeps the calling component's panel on the layer stack while it is mounted. The handlers may
 * change on every render; the layer keeps its place in the stack. A layout effect, because its
 * cleanup runs as the panel unmounts (Preact 11 defers a plain effect's cleanup), so a closed
 * panel never stays on top of the stack.
 */
export function useDismissLayer(layer: DismissLayer): void {
  const latest = useRef(layer);
  latest.current = layer;
  useLayoutEffect(
    () =>
      pushLayer(document, {
        onEscape: () => latest.current.onEscape(),
        onPointerDown: (t) => latest.current.onPointerDown?.(t),
      }),
    [],
  );
}
