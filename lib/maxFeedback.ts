export const MAX_ORIGIN = "https://max.chaos.fail";
const KINDS = new Set(["Bug", "Feature request", "Feedback", "Crash"]);
const AREAS = new Set(["Settings", "Editor", "Pages", "Database", "Workspace", "Account", "Recovery", "Other"]);
export function parseMaxFeedback(body: string) {
  if (!body || body.length > 5000) return null;
  try {
    const v = JSON.parse(body);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    if (typeof v.kind !== "string" || !KINDS.has(v.kind) ||
        typeof v.message !== "string" || v.message.trim().length < 6 || v.message.length > 2000 ||
        typeof v.area !== "string" || !AREAS.has(v.area) ||
        typeof v.version !== "string" || !/^[A-Za-z0-9.+-]{1,64}$/.test(v.version) ||
        typeof v.submissionKey !== "string" || !/^[A-Za-z0-9-]{8,100}$/.test(v.submissionKey)) return null;
    return { kind: v.kind as string, message: v.message.trim() as string, area: v.area as string, version: v.version as string, submissionKey: v.submissionKey as string };
  } catch { return null; }
}
