export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 420;
export const SIDEBAR_DEFAULT = 256;
export const clampWidth = (width: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width));

/** Restore the existing sidebar keys, tolerating unavailable browser storage. */
export function readSidebarPreferences(storage: Pick<Storage, "getItem">): { collapsed: boolean; width: number } {
  try {
    const collapsed = storage.getItem("chaos.ui.sidebar-collapsed") === "true";
    const stored = Number(storage.getItem("chaos.ui.sidebar-width"));
    return { collapsed, width: stored ? clampWidth(stored) : SIDEBAR_DEFAULT };
  } catch { return { collapsed: false, width: SIDEBAR_DEFAULT }; }
}
