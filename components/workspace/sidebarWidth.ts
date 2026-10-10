/** Persisted widths and pointer resizing must use the same limits. */
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 420;
export const SIDEBAR_DEFAULT = 256;

export const clampWidth = (width: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width));
