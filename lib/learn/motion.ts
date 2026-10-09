/** Motion is reduced by the system setting or by Chaos's own Reduce motion preference. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.classList.contains("reduce-motion") || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
