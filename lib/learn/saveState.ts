/**
 * What the lesson editor tells the writer about their work, derived from one set of facts so the
 * label, the unload guard and the retry loop never disagree.
 *
 *   saved     every change is stored (on the server, or on this device in local-only mode)
 *   unsaved   changes are waiting for the 600 ms autosave
 *   saving    a write is in flight
 *   retrying  a write failed for a reason that usually passes (network, timeout); it will retry
 *   offline   the browser is offline; changes are kept on this device and saved on reconnect
 *   failed    a write was refused; the error explains why and what to do
 *   conflict  another device saved a newer revision; writes stopped until the writer chooses
 */
export type SaveState = "saved" | "unsaved" | "saving" | "retrying" | "offline" | "failed" | "conflict";

export interface SaveFacts {
  pending: boolean;
  saving: boolean;
  online: boolean;
  conflict: boolean;
  error: boolean;
  retrying: boolean;
}

export function deriveSaveState(f: SaveFacts): SaveState {
  if (f.conflict) return "conflict";
  if (!f.online && (f.pending || f.saving || f.error || f.retrying)) return "offline";
  if (f.retrying) return "retrying";
  if (f.saving) return "saving";
  if (f.error) return "failed";
  if (f.pending) return "unsaved";
  return "saved";
}

/** Leaving the page now could lose work the server does not have yet. */
export const hasUnsavedWork = (state: SaveState) => state !== "saved";

export const saveStateCopy: Record<"en" | "ar", Record<SaveState, string>> = {
  en: {
    saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…", retrying: "Connection problem · retrying…",
    offline: "Offline · changes kept on this device", failed: "Not saved · see the message below", conflict: "Not saved · changed on another device",
  },
  ar: {
    saved: "محفوظ", unsaved: "تغييرات غير محفوظة", saving: "جارٍ الحفظ…", retrying: "مشكلة في الاتصال · إعادة المحاولة…",
    offline: "غير متصل · التغييرات محفوظة على هذا الجهاز", failed: "لم يُحفظ · راجع الرسالة أدناه", conflict: "لم يُحفظ · تغيّر على جهاز آخر",
  },
};

/** Codes the server uses for writes that will fail the same way if retried. */
const PERMANENT_CODES = new Set(["REVISION_CONFLICT", "VALIDATION", "FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND", "LIMIT", "RATE_LIMITED"]);

/**
 * A failure worth retrying by itself: the network dropped, the request timed out or the server
 * was briefly unavailable. Validation errors, conflicts and permission errors are not; retrying
 * them would only repeat the same message.
 */
export function isTransientSaveError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const data = "data" in err ? (err as { data?: unknown }).data : undefined;
  if (data && typeof data === "object" && "code" in data && PERMANENT_CODES.has(String((data as { code: unknown }).code))) return false;
  if (data !== undefined) return false; // Any structured server error is a decision, not an outage.
  const name = "name" in err ? String((err as { name: unknown }).name) : "";
  const message = "message" in err ? String((err as { message: unknown }).message) : "";
  if (name === "AbortError" || name === "TimeoutError" || name === "NetworkError") return true;
  if (err instanceof TypeError && /fetch|network|load failed/i.test(message)) return true;
  return /network|timed? ?out|connection (?:lost|closed|reset)|failed to fetch|websocket|temporarily unavailable|\b50[234]\b/i.test(message);
}

/** Delay before retry `attempt` (1-based): 1 s, 2 s, 4 s, 8 s, capped at 15 s. */
export const retryDelay = (attempt: number) => Math.min(15_000, 1000 * 2 ** Math.max(0, attempt - 1));
export const MAX_SAVE_RETRIES = 4;
