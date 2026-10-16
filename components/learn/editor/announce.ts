/**
 * Polite screen-reader announcements for editor actions that change the document without moving
 * the caret into new text (moves, duplicates, deletes, drops). LessonEditor renders the one live
 * region; announcing before it mounts is a no-op.
 */
export const LIVE_REGION_ATTR = "data-lx-editor-live";

export function announce(message: string) {
  if (typeof document === "undefined" || !message) return;
  const region = document.querySelector(`[${LIVE_REGION_ATTR}]`);
  if (!region) return;
  // Clearing first makes a repeated message ("Moved up" twice) announce again.
  region.textContent = "";
  window.setTimeout(() => { region.textContent = message; }, 30);
}
