import { v } from "convex/values";
import { env, internalAction, internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { requireAdmin } from "./authz";

/**
 * Nightly consistency checks. Each check states an invariant the app relies on
 * and counts the rows that break it; nothing is repaired here. The cron
 * detects; the report records it (admin `consistency:latest`, the Convex logs)
 * and, when CONSISTENCY_GITHUB_TOKEN and CONSISTENCY_GITHUB_REPO are set, a
 * GitHub issue reports it. Tables are walked one page per transaction, so a run
 * stays inside Convex's read limits however large they grow.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SAMPLES = 10;
const KEEP_REPORTS = 30;

type Add = (check: string, id: string) => void;
type Scan<T extends TableNames> = { table: T; pageSize: number; check: (ctx: MutationCtx, doc: Doc<T>, add: Add) => Promise<void> };

/** Module assessments store their target as a plain string id. */
async function assessmentExists(ctx: MutationCtx, kind: "form" | "quiz", id: string) {
  const formId = kind === "form" ? ctx.db.normalizeId("forms", id) : null;
  return !!formId && !!(await ctx.db.get("forms", formId));
}

const courses: Scan<"learnCollections"> = {
  table: "learnCollections", pageSize: 10,
  check: async (ctx, course, add) => {
    const id = course._id;
    // The draft outline and modules name lessons that no longer exist.
    const draft = new Set<Id<"lessons">>([...(course.lessonIds ?? []), ...(course.modules ?? []).flatMap((m) => m.lessonIds)]);
    for (const lessonId of draft) if (!(await ctx.db.get("lessons", lessonId))) add("course.lessonMissing", `${id} → ${lessonId}`);
    // Module assessments point at quiz forms that are gone.
    for (const a of (course.modules ?? []).flatMap((m) => m.assessments)) {
      if (!(await assessmentExists(ctx, a.kind, a.id))) add("course.assessmentMissing", `${id} → ${a.kind}:${a.id}`);
    }
    if (!course.publishedVersionId) return;
    const version = await ctx.db.get("collectionVersions", course.publishedVersionId);
    if (!version || version.collectionId !== id) { add("course.publishedVersionMissing", `${id} → ${course.publishedVersionId}`); return; }
    // A published course must be able to serve every lesson version it lists.
    for (const item of version.items) {
      if (item.kind !== "lesson") continue;
      const [lesson, lessonVersion] = await Promise.all([ctx.db.get("lessons", item.id), ctx.db.get("lessonVersions", item.versionId)]);
      if (!lesson) add("publishedCourse.lessonMissing", `${id} → ${item.id}`);
      else if (!lessonVersion || lessonVersion.lessonId !== item.id) add("publishedCourse.lessonVersionMissing", `${id} → ${item.versionId}`);
    }
  },
};

const lessons: Scan<"lessons"> = {
  table: "lessons", pageSize: 10,
  check: async (ctx, lesson, add) => {
    if (!lesson.publishedVersionId) return;
    const version = await ctx.db.get("lessonVersions", lesson.publishedVersionId);
    if (!version || version.lessonId !== lesson._id) add("lesson.publishedVersionMissing", `${lesson._id} → ${lesson.publishedVersionId}`);
  },
};

const assessments: Scan<"lessonAssessments"> = {
  table: "lessonAssessments", pageSize: 200,
  check: async (ctx, link, add) => {
    if (!(await ctx.db.get("lessons", link.lessonId))) add("assessment.lessonMissing", `${link._id} → ${link.lessonId}`);
    const asset = link.asset.kind === "form" ? await ctx.db.get("forms", link.asset.id) : null;
    if (!asset) add("assessment.orphaned", `${link.lessonId} → ${link.asset.kind}:${link.asset.id}`);
  },
};

const flashcards: Scan<"lessonFlashcards"> = {
  table: "lessonFlashcards", pageSize: 200,
  check: async (ctx, link, add) => {
    if (!(await ctx.db.get("lessons", link.lessonId))) add("flashcards.lessonMissing", `${link._id} → ${link.lessonId}`);
    const [set, version] = await Promise.all([ctx.db.get("flashcardSets", link.setId), ctx.db.get("flashcardVersions", link.versionId)]);
    if (!set || !version || version.setId !== link.setId) add("flashcards.orphaned", `${link.lessonId} → ${link.setId}`);
  },
};

const forms: Scan<"forms"> = {
  table: "forms", pageSize: 20,
  check: async (ctx, form, add) => {
    if (form.status === "live" && form.publishedVersion === undefined) add("form.liveWithoutVersion", form._id);
    const published = form.publishedVersion;
    if (published === undefined) return;
    const version = await ctx.db.query("formVersions").withIndex("by_formId_and_version", (q) => q.eq("formId", form._id).eq("version", published)).unique();
    if (!version) add("form.publishedVersionMissing", `${form._id} v${published}`);
  },
};

/** Table walks, in order. Tables with large documents (lesson drafts, course outlines) get small pages. */
const SCANS = [courses, lessons, assessments, flashcards, forms] as unknown as Scan<TableNames>[];

/** One-shot checks after the walks: leftovers the hourly cleanup should have removed, and work that never finished. */
async function finalChecks(ctx: MutationCtx, add: Add) {
  const now = Date.now();
  // crons.cleanup removes these within the hour; a day-old one means the cleanup is failing or behind.
  for (const t of await ctx.db.query("formUploadTickets").withIndex("by_expiresAt", (q) => q.lt("expiresAt", now - DAY)).take(SAMPLES)) add("stale.uploadTickets", t._id);
  for (const d of await ctx.db.query("formResumeDrafts").withIndex("by_expiresAt", (q) => q.lt("expiresAt", now - DAY)).take(SAMPLES)) add("stale.resumeDrafts", d._id);
  for (const g of await ctx.db.query("formAccessGrants").withIndex("by_expiresAt", (q) => q.lt("expiresAt", now - DAY)).take(SAMPLES)) add("stale.accessGrants", g._id);
  for (const w of await ctx.db.query("rateWindows").withIndex("by_windowStart", (q) => q.lt("windowStart", now - DAY)).take(SAMPLES)) add("stale.rateWindows", w._id);
  // Jobs that should have completed.
  for (const job of await ctx.db.query("adminBulkJobs").order("desc").take(50)) if (!job.done && job._creationTime < now - HOUR) add("job.bulkStuck", job._id);
  for (const fn of await ctx.db.system.query("_scheduled_functions").order("desc").take(500)) {
    if (fn.scheduledTime < now - DAY) continue;
    if (fn.state.kind === "failed") add("job.scheduledFailed", `${fn.name} ${fn._id}`);
    else if ((fn.state.kind === "pending" || fn.state.kind === "inProgress") && fn.scheduledTime < now - HOUR) add("job.scheduledStuck", `${fn.name} ${fn._id}`);
  }
}

type Finding = Doc<"consistencyReports">["findings"][number];
function collector(findings: Finding[]): Add {
  return (check, id) => {
    let f = findings.find((x) => x.check === check);
    if (!f) findings.push((f = { check, count: 0, samples: [] }));
    f.count++;
    if (f.samples.length < SAMPLES) f.samples.push(id);
  };
}

export const start = internalMutation({
  args: {}, returns: v.id("consistencyReports"),
  handler: async (ctx) => {
    const reportId = await ctx.db.insert("consistencyReports", { startedAt: Date.now(), scanned: 0, findings: [] });
    await ctx.scheduler.runAfter(0, internal.consistency.step, { reportId, scan: 0, cursor: null });
    return reportId;
  },
});

export const step = internalMutation({
  args: { reportId: v.id("consistencyReports"), scan: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { reportId, scan, cursor }) => {
    const report = await ctx.db.get("consistencyReports", reportId);
    if (!report || report.finishedAt) return null;
    const findings = report.findings;
    const add = collector(findings);
    if (scan < SCANS.length) {
      const { table, pageSize, check } = SCANS[scan];
      const page = await ctx.db.query(table).paginate({ numItems: pageSize, cursor, maximumBytesRead: 4 * 1024 * 1024 });
      for (const doc of page.page) await check(ctx, doc, add);
      await ctx.db.patch("consistencyReports", reportId, { findings, scanned: report.scanned + page.page.length });
      await ctx.scheduler.runAfter(0, internal.consistency.step, page.isDone ? { reportId, scan: scan + 1, cursor: null } : { reportId, scan, cursor: page.continueCursor });
      return null;
    }
    await finalChecks(ctx, add);
    await ctx.db.patch("consistencyReports", reportId, { findings, finishedAt: Date.now() });
    const older = await ctx.db.query("consistencyReports").withIndex("by_startedAt").order("desc").take(KEEP_REPORTS + 5);
    for (const r of older.slice(KEEP_REPORTS)) await ctx.db.delete("consistencyReports", r._id);
    if (findings.length) {
      console.error(`Consistency check found problems: ${findings.map((f) => `${f.check} ×${f.count}`).join(", ")}`);
      await ctx.scheduler.runAfter(0, internal.consistency.alert, { reportId });
    }
    return null;
  },
});

export const report = internalQuery({
  args: { reportId: v.id("consistencyReports") }, returns: v.union(schema.doc("consistencyReports"), v.null()),
  handler: (ctx, { reportId }) => ctx.db.get("consistencyReports", reportId),
});

/** The most recent finished report, for admins. */
export const latest = query({
  args: {}, returns: v.union(schema.doc("consistencyReports"), v.null()),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    for (const r of await ctx.db.query("consistencyReports").withIndex("by_startedAt").order("desc").take(3)) if (r.finishedAt) return r;
    return null;
  },
});

/** Formats a report as a GitHub issue body. */
export function issueBody(report: Doc<"consistencyReports">) {
  return [
    `Scanned ${report.scanned} rows on ${new Date(report.startedAt).toISOString()} (report \`${report._id}\`).`, "",
    "| Check | Rows | Examples |", "|---|---:|---|",
    ...report.findings.map((f) => `| \`${f.check}\` | ${f.count} | ${f.samples.slice(0, 5).map((s) => `\`${s}\``).join("<br>")} |`),
    "", "Detected by the nightly Convex consistency cron (`convex/consistency.ts`). Nothing was repaired automatically.",
  ].join("\n");
}

/** Opens a GitHub issue for the report, or comments on the open one, when a token and repository are configured. */
export const alert = internalAction({
  args: { reportId: v.id("consistencyReports") }, returns: v.null(),
  handler: async (ctx, { reportId }) => {
    const token = env.CONSISTENCY_GITHUB_TOKEN, repo = env.CONSISTENCY_GITHUB_REPO;
    if (!token || !repo) return null;
    const report = await ctx.runQuery(internal.consistency.report, { reportId });
    if (!report) return null;
    const body = issueBody(report);
    const gh = (path: string, init?: RequestInit) => fetch(`https://api.github.com/repos/${repo}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" } });
    const open = await gh("/issues?state=open&labels=data-consistency&per_page=1");
    const [existing] = open.ok ? ((await open.json()) as { number: number }[]) : [];
    const res = existing
      ? await gh(`/issues/${existing.number}/comments`, { method: "POST", body: JSON.stringify({ body }) })
      : await gh("/issues", { method: "POST", body: JSON.stringify({ title: "Data consistency check found problems", body, labels: ["data-consistency"] }) });
    if (!res.ok) console.error(`Consistency alert: GitHub answered ${res.status}`);
    return null;
  },
});
