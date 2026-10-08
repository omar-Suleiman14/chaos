import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * What a published course shows, and when it changes:
 *
 * - Publishing the course publishes everything: details, outline, modules and
 *   every lesson in it.
 * - Publishing one lesson of a live course also publishes the course's current
 *   structure (outline and modules), so a lesson added to a new module appears
 *   where the owner put it. Lessons without a published version stay out.
 * - Course details (title, description, cover, tags, level) change only when
 *   the course is published again.
 *
 * `pendingCourseChanges` tells the editor and MCP what is still waiting.
 */
type Course = Doc<"learnCollections">;
type Version = Doc<"collectionVersions">;

const draftOutline = (course: Course) => course.lessonIds ?? course.items.flatMap((i) => (i.kind === "lesson" ? [i.id] : []));
const liveOutline = (version: Version) => version.items.flatMap((i) => (i.kind === "lesson" ? [i.id] : []));
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export type PendingCourseChange = "details" | "structure";

export function pendingCourseChanges(course: Course, version: Version | null, publishedLessons: ReadonlySet<Id<"lessons">>): PendingCourseChange[] {
  if (!version) return [];
  const pending: PendingCourseChange[] = [];
  if (!same(course.metadata, version.metadata) || !same(course.details, version.details)) pending.push("details");
  // Only lessons that can be live count: an unpublished lesson in the draft is reported on its own row.
  const outline = draftOutline(course).filter((id) => publishedLessons.has(id));
  const modules = (course.modules ?? []).map((m) => ({ ...m, lessonIds: m.lessonIds.filter((id) => publishedLessons.has(id)) }));
  const liveModules = (version.modules ?? []).map((m) => ({ ...m, lessonIds: m.lessonIds.filter((id) => publishedLessons.has(id)) }));
  if (!same(outline, liveOutline(version)) || !same(modules, liveModules)) pending.push("structure");
  return pending;
}

async function assessmentLive(ctx: QueryCtx, asset: { kind: "form" | "quiz"; id: string }) {
  const id = asset.kind === "form" ? ctx.db.normalizeId("forms", asset.id) : null;
  const form = id ? await ctx.db.get("forms", id) : null;
  return !!form && form.status === "live" && !form.isBanned && form.publishedVersion !== undefined;
}

/** The live structure after `lessonId` was published as `versionId`: the draft outline and modules, live lessons only. */
export async function liveStructureAfterLessonPublish(ctx: MutationCtx, course: Course, live: Version, lessonId: Id<"lessons">, versionId: Id<"lessonVersions">) {
  const pinned = new Map(live.items.flatMap((i) => (i.kind === "lesson" ? [[i.id, i.versionId] as const] : [])));
  const items: Course["items"] = [];
  for (const id of draftOutline(course)) {
    if (id === lessonId) { items.push({ kind: "lesson", id, versionId }); continue; }
    const kept = pinned.get(id);
    if (kept) { items.push({ kind: "lesson", id, versionId: kept }); continue; }
    // A lesson added to the course and published earlier, before this structure went live.
    const lesson = await ctx.db.get("lessons", id);
    if (lesson && lesson.ownerId === course.ownerId && lesson.status === "active" && lesson.communityState === "ok" && lesson.publishedVersionId) items.push({ kind: "lesson", id, versionId: lesson.publishedVersionId });
  }
  const liveAssets = new Set((live.modules ?? []).flatMap((m) => m.assessments.map((a) => `${a.kind}:${a.id}`)));
  const modules: NonNullable<Course["modules"]> = [];
  for (const m of course.modules ?? []) {
    const assessments = [];
    for (const asset of m.assessments) if (liveAssets.has(`${asset.kind}:${asset.id}`) || await assessmentLive(ctx, asset)) assessments.push(asset);
    modules.push({ ...m, assessments });
  }
  return { items, modules };
}
