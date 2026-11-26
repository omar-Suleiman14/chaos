export const MAX_ORIGIN = "https://max.chaos.fail";
export const MAX_FEEDBACK_BYTES = 16 * 1024;
const KINDS = new Set(["Bug", "Feature request", "Feedback", "Crash"]);
const AREAS = new Set(["Settings", "Editor", "Pages", "Database", "Workspace", "Account", "Recovery", "Other"]);
export const CREDIT_LABEL = "Public credit (optional)";
export function validPublicAlias(value: unknown): value is string { return typeof value === "string" && /^[\p{L}\p{M}\p{N} _-]{1,40}$/u.test(value.trim()); }
export function parseMaxFeedback(body: string) {
  if (!body || new TextEncoder().encode(body).byteLength > MAX_FEEDBACK_BYTES) return null;
  try {
    const v = JSON.parse(body);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    if (typeof v.kind !== "string" || !KINDS.has(v.kind) ||
        typeof v.message !== "string" || v.message.trim().length < 6 || v.message.length > 2000 ||
        typeof v.area !== "string" || !AREAS.has(v.area) ||
        typeof v.version !== "string" || !/^[A-Za-z0-9.+-]{1,64}$/.test(v.version) ||
        typeof v.submissionKey !== "string" || !/^[A-Za-z0-9-]{8,100}$/.test(v.submissionKey)) return null;
    if (v.publicAlias !== undefined && !validPublicAlias(v.publicAlias)) return null;
    return { kind: v.kind as string, message: v.message.trim() as string, area: v.area as string, version: v.version as string, submissionKey: v.submissionKey as string, ...(v.publicAlias === undefined ? {} : {publicAlias:v.publicAlias.trim()}) };
  } catch { return null; }
}

/** Bound memory before parsing even if a caller omits or forges Content-Length. */
export async function readMaxFeedbackBody(request: Request): Promise<string | null> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_FEEDBACK_BYTES)) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_FEEDBACK_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
