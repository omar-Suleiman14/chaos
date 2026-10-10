/**
 * A deletion restarts the current bounded form page. Only a page with no
 * expired response may advance, even when the page happened to be the last.
 */
export function nextRetentionPageCursor(
  originalCursor: string | null,
  continueCursor: string,
  isDone: boolean,
  deletedResponse: boolean,
): string | null | undefined {
  if (deletedResponse) return originalCursor;
  if (isDone) return undefined;
  return continueCursor;
}
