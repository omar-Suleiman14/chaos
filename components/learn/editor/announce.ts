/**
 * Polite screen-reader announcements for editor actions that change the document without moving
 * the caret into new text (moves, duplicates, deletes, drops). The live region is created on the
 * first announcement, so mounting the editor costs nothing; it is filled a moment after creation
 * so assistive technology registers the region before its content changes.
 */
export const LIVE_REGION_ATTR = "data-lx-editor-live";

export function announce(message: string) {
  if (typeof document === "undefined" || !message) return;
  let region = document.querySelector(`[${LIVE_REGION_ATTR}]`);
  if (!region) {
    region = document.createElement("output");
    region.setAttribute(LIVE_REGION_ATTR, "");
    region.setAttribute("aria-live", "polite");
    region.className = "sr-only";
    document.body.appendChild(region);
  }
  // Clearing first makes a repeated message ("Moved up" twice) announce again.
  region.textContent = "";
  const target = region;
  window.setTimeout(() => { target.textContent = message; }, 30);
}
