const PREFIX = "chaos-search-v1:";
const MAX_CURSOR_BYTES = 20000;
type SearchCursor =
  | { phase: "text"; text: string; cursor: string | null }
  | {
      phase: "authors"; text: string; userCursor: string | null; usersRead: number; usersDone: boolean;
      remainingUsers: string[]; currentUser: string | null; lessonCursor: string | null;
      pending: { lessonId: string; cursor: string | null; lastForOwner: boolean } | null;
    };

const nativeCursor = (value: unknown): value is string | null => value === null || typeof value === "string" && value.length <= MAX_CURSOR_BYTES;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function readSearchCursor(cursor: string | null, text: string): SearchCursor {
  // In-flight native full-text cursors from the previous implementation remain usable.
  if (!cursor?.startsWith(PREFIX)) return { phase: "text", text, cursor };
  try {
    if (cursor.length > MAX_CURSOR_BYTES) throw new Error();
    const binary = atob(cursor.slice(PREFIX.length));
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
    if (!record(value) || value.text !== text) throw new Error();
    if (value.phase === "text" && nativeCursor(value.cursor)) return { phase: "text", text, cursor: value.cursor };
    if (
      value.phase !== "authors" || !nativeCursor(value.userCursor) ||
      !nativeCursor(value.lessonCursor) || !nativeCursor(value.currentUser) ||
      typeof value.usersRead !== "number" || !Number.isSafeInteger(value.usersRead) ||
      value.usersRead < 0 || value.usersRead > 100 || typeof value.usersDone !== "boolean" ||
      !Array.isArray(value.remainingUsers) || value.remainingUsers.length > 20 ||
      !value.remainingUsers.every(id => typeof id === "string" && id.length <= 100)
    ) throw new Error();
    let pending: Extract<SearchCursor, { phase: "authors" }>["pending"] = null;
    if (value.pending !== null) {
      if (!record(value.pending) || typeof value.pending.lessonId !== "string" || value.pending.lessonId.length > 100 || !nativeCursor(value.pending.cursor) || typeof value.pending.lastForOwner !== "boolean" || value.currentUser === null) throw new Error();
      pending = { lessonId: value.pending.lessonId, cursor: value.pending.cursor, lastForOwner: value.pending.lastForOwner };
    }
    return { phase: "authors", text, userCursor: value.userCursor, usersRead: value.usersRead, usersDone: value.usersDone, remainingUsers: value.remainingUsers, currentUser: value.currentUser, lessonCursor: value.lessonCursor, pending };
  } catch {
    throw new Error("INVALID_SEARCH_CURSOR: Restart this search with a null cursor.");
  }
}
export function writeSearchCursor(cursor: SearchCursor) {
  const binary = Array.from(new TextEncoder().encode(JSON.stringify(cursor)), byte => String.fromCharCode(byte)).join("");
  const result = PREFIX + btoa(binary);
  if (result.length > MAX_CURSOR_BYTES) throw new Error("INVALID_SEARCH_CURSOR: Search cursor exceeds its byte bound.");
  return result;
}
export function authorSearchCursor(text: string): Extract<SearchCursor, { phase: "authors" }> {
  return { phase: "authors", text, userCursor: null, usersRead: 0, usersDone: false, remainingUsers: [], currentUser: null, lessonCursor: null, pending: null };
}
