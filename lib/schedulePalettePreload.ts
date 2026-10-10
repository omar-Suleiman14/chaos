/** Schedule a lightweight lazy preload, cancelling work when its caller unmounts. */
export function schedulePalettePreload(target: Window, load: () => void): () => void {
  const idle = target as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  // Use the idle path only when there is a paired cancellation API.
  if (typeof idle.requestIdleCallback === "function" && typeof idle.cancelIdleCallback === "function") {
    const id = idle.requestIdleCallback(load, { timeout: 5000 });
    return () => idle.cancelIdleCallback?.(id);
  }

  const id = target.setTimeout(load, 3000);
  return () => target.clearTimeout(id);
}
