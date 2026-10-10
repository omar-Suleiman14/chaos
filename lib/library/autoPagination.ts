/**
 * Fetch a few additional pages automatically if the selected Forms/Quizzes tab is empty.
 * One backend page can contain only archived items or items of the other kind.
 * A small budget avoids silently scanning a large collection on every visit.
 */
export const MAX_EMPTY_LIBRARY_PAGE_ADVANCES = 3;

export function shouldAdvanceEmptyLibraryPage(
  kind: string,
  confirmed: boolean,
  visibleCount: number,
  hasMore: boolean,
  attempted: number,
): boolean {
  return (kind === "Forms" || kind === "Quizzes") &&
    confirmed && visibleCount === 0 && hasMore &&
    attempted < MAX_EMPTY_LIBRARY_PAGE_ADVANCES;
}
