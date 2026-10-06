// Opens, updates and closes GitHub issues for scheduled checks, with no model in the loop.
// Each check owns one issue, found by a hidden marker in its body, so a regression that
// persists for a week is one issue with comments, not seven issues.

export type IssueKey = { marker: string; title: string; labels: string[] };
type Issue = { number: number; body?: string | null; state: string };

const API = "https://api.github.com";

function config() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY ?? process.env.GH_REPO;
  if (!token || !repo) return null;
  return { token, repo };
}

async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
  const c = config();
  if (!c) throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required to report issues.");
  const response = await fetch(`${API}/repos/${c.repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
  return (response.status === 204 ? null : await response.json()) as T;
}

/** The hidden HTML comment that identifies a check's issue. */
export const markerOf = (marker: string) => `<!-- chaos-check:${marker} -->`;

async function findOpen(key: IssueKey): Promise<Issue | null> {
  const label = encodeURIComponent(key.labels[0] ?? "");
  const issues = await gh<Issue[]>(`/issues?state=open&per_page=100${label ? `&labels=${label}` : ""}`);
  return issues.find((i) => i.body?.includes(markerOf(key.marker))) ?? null;
}

/** Opens the check's issue, or comments on the open one. Prints instead when no token is set (local runs). */
export async function reportProblem(key: IssueKey, body: string): Promise<void> {
  if (!config()) { console.log(`[issue] ${key.title}\n${body}`); return; }
  for (const label of key.labels) await gh(`/labels`, { method: "POST", body: JSON.stringify({ name: label, color: "B60205" }) }).catch(() => undefined);
  const open = await findOpen(key);
  if (open) await gh(`/issues/${open.number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  else await gh(`/issues`, { method: "POST", body: JSON.stringify({ title: key.title, labels: key.labels, body: `${markerOf(key.marker)}\n${body}` }) });
}

/** Closes the check's open issue with a note, if there is one. */
export async function reportHealthy(key: IssueKey, note: string): Promise<void> {
  if (!config()) return;
  const open = await findOpen(key);
  if (!open) return;
  await gh(`/issues/${open.number}/comments`, { method: "POST", body: JSON.stringify({ body: note }) });
  await gh(`/issues/${open.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
}
