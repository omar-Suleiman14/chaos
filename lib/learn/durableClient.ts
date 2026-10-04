import type { ConvexReactClient } from "convex/react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { toDurableDocument } from "./chaosDocument";
import type { LessonMeta } from "./types";
class PreflightError extends Error {}
type Client = Pick<ConvexReactClient, "query" | "mutation">;
export function durableMetadata(meta: LessonMeta): Doc<"lessons">["metadata"] {
  if (meta.curricula.length) throw new Error("Curriculum mappings must be saved through the curriculum API; this editor does not support them yet.");
  const { curricula: _curricula, ...value } = meta;
  return value;
}

export type ProgressTarget = { lessonId: Id<"lessons">; versionId: Id<"lessonVersions">; blockIds: string[] };
/** A client owns its session; it must never borrow a newer device's sequence. */
export class DurableProgressClient {
  private tails = new Map<string, Promise<void>>();
  private sessions = new Map<string, number>();
  private failures = new Map<string, unknown>();
  constructor(private client: Client) {}
  save(target: ProgressTarget, patch: { state?: string; lastBlockId?: string; percent?: number }): Promise<void> {
    if (patch.percent !== undefined && !Number.isFinite(patch.percent)) return Promise.reject(new Error("Invalid reading percentage."));
    const key = target.lessonId + ":" + target.versionId;
    const count = patch.state === "completed" ? target.blockIds.length : Math.max(patch.lastBlockId ? target.blockIds.indexOf(patch.lastBlockId) : 0, Math.floor(target.blockIds.length * Math.min(100, Math.max(0, patch.percent ?? 0)) / 100));
    const blockIds = target.blockIds.slice(0, Math.max(0, count));
    const next = (this.tails.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      if (patch.state !== "not_started" && this.failures.has(key)) throw this.failures.get(key);
      const args = { lessonId: target.lessonId, versionId: target.versionId };
      try {
        let row = await this.client.query(api.learnCommunity.getProgress, args);
        if (patch.state === "not_started") {
          const sessionSeq = await this.client.mutation(api.learnCommunity.resetProgress, { ...args, expectedSessionSeq: row?.sessionSeq ?? 0 });
          this.sessions.set(key, sessionSeq); this.failures.delete(key); return;
        }
        const completed = row?.completedBlocks;
        if (completed && blockIds.every(id => completed.includes(id)) && (patch.state !== "completed" || row?.completionAcknowledged === true)) return;
        let sessionSeq = this.sessions.get(key);
        if (sessionSeq === undefined) {
          sessionSeq = await this.client.mutation(api.learnCommunity.startSession, args);
          this.sessions.set(key, sessionSeq);
          row = await this.client.query(api.learnCommunity.getProgress, args);
        }
        if (row?.sessionSeq !== sessionSeq) throw new Error("Progress conflict: another device started a newer study session. Refresh before retrying.");
        const ok = await this.client.mutation(api.learnCommunity.completeBlocks, { ...args, sessionSeq, writeSeq: row.writeSeq + 1, blockIds, completed: patch.state === "completed" });
        if (!ok) throw new Error("Progress conflict: refresh before retrying.");
      } catch (error) { this.failures.set(key, error); throw error; }
    });
    this.tails.set(key, next);
    return next;
  }
}
/** One queue per mounted editor. An error freezes writes until explicit reload/recovery. */
export class DurableLessonClient {
  private rows = new Map<string, Doc<"lessons">>();
  private tails = new Map<string, Promise<unknown>>();
  private failures = new Map<string, unknown>();
  private visibility = new Map<string, string>();
  constructor(private client: Client) {}
  observe(row: Doc<"lessons">) { if (!this.rows.has(row._id)) this.rows.set(row._id, row); }
  /** Explicitly abandon the frozen baseline only after all earlier operations settle. */
  reload(id: string) {
    const next = (this.tails.get(id) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      const row = await this.client.query(api.learnFrontend.editableLesson, { id });
      if (!row) throw new Error("Lesson is no longer editable.");
      this.rows.set(id, row);
      this.failures.delete(id);
      this.visibility.delete(id);
      return row;
    });
    this.tails.set(id, next);
    return next;
  }
  private enqueue<T>(id: string, operation: (row: Doc<"lessons">) => Promise<T>): Promise<T> {
    const next = (this.tails.get(id) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      if (this.failures.has(id)) throw this.failures.get(id);
      let row = this.rows.get(id);
      if (!row) {
        const editable = await this.client.query(api.learnFrontend.editableLesson, { id });
        if (!editable) throw new Error("Lesson is no longer editable.");
        row = editable;
        this.observe(row);
      }
      try { return await operation(row); } catch (error) { if (!(error instanceof PreflightError)) this.failures.set(id, error); throw error; }
    });
    this.tails.set(id, next);
    return next;
  }
  saveContent(id: string, content: unknown[]) {
    content = structuredClone(content);
    return this.enqueue(id, async row => {
      let document; try { document = toDurableDocument(content, row.draft); } catch (error) { throw new PreflightError(error instanceof Error ? error.message : "Invalid lesson blocks"); }
      const revision = await this.client.mutation(api.lessons.saveDraft, { lessonId: row._id, expectedRevision: row.revision, document });
      this.rows.set(id, { ...row, draft: document, revision });
      return revision;
    });
  }
  saveMeta(id: string, patch: Partial<LessonMeta>) {
    patch = structuredClone(patch);
    return this.enqueue(id, async row => {
      let metadata;
      try { metadata = durableMetadata({ ...row.metadata, curricula: [], indexing: row.metadata.indexing ?? "noindex", ...patch }); }
      catch (error) { throw new PreflightError(error instanceof Error ? error.message : "Invalid metadata"); }
      const revision = await this.client.mutation(api.lessons.saveDraft, { lessonId: row._id, expectedRevision: row.revision, document: row.draft, metadata });
      this.rows.set(id, { ...row, metadata, revision });
      return revision;
    });
  }
  setVisibility(id: string, visibility: string) {
    // team:<teamId> publishes as restricted to that Business team.
    if (visibility !== "private" && visibility !== "public" && !/^team:[a-z0-9]+$/.test(visibility)) throw new Error("Unlisted publishing is not supported by this backend. Choose private or public.");
    this.visibility.set(id, visibility);
  }
  publish(id: string, note?: string) {
    return this.enqueue(id, async row => {
      const chosen = this.visibility.get(id) ?? (row.visibility === "restricted" && row.audienceTeamId ? `team:${row.audienceTeamId}` : row.publishedVersionId && row.visibility === "private" ? "private" : "public");
      const team = chosen.startsWith("team:") ? chosen.slice(5) as Id<"businessTeams"> : undefined;
      const result = await this.client.mutation(api.lessons.publish, { lessonId: row._id, expectedRevision: row.revision, ...(note?.trim() ? { note: note.trim() } : {}), visibility: team ? "restricted" : chosen as "private" | "public", ...(team ? { teamId: team } : {}) });
      if (!result.ok) throw new PreflightError(result.problems.map(p => p.path + ": " + p.message).join("\n"));
      this.rows.set(id, { ...row, revision: result.revision, publishedVersionId: result.versionId });
      const version = await this.client.query(api.lessons.getPublished, { lessonId: row._id });
      return version?.number ?? 0;
    });
  }
  lifecycle(id: string, action: "archive" | "reactivate" | "unpublish") {
    return this.enqueue(id, async row => {
      const revision = await this.client.mutation(api.lessons.setLifecycle, { lessonId: row._id, expectedRevision: row.revision, action });
      this.rows.set(id, { ...row, revision, status: action === "archive" ? "archived" : "active", ...(action === "unpublish" ? { publishedVersionId: undefined, visibility: "private" as const } : {}) });
    });
  }
  restore(id: string, number?: number) {
    return this.enqueue(id, async row => {
      const versions = await this.client.query(api.lessons.listVersions, { lessonId: row._id, paginationOpts: { cursor: null, numItems: 100 } });
      const version = number === undefined ? versions.page.find(v => v._id === row.publishedVersionId) : versions.page.find(v => v.number === number);
      if (!version) throw new Error("Version not found in the latest 100 versions.");
      const revision = await this.client.mutation(api.lessons.restoreVersion, { lessonId: row._id, expectedRevision: row.revision, versionId: version._id });
      this.rows.set(id, { ...row, draft: version.document, metadata: version.metadata, revision });
    });
  }
  recover(id: string, recoveryId: Id<"lessonDraftRecovery">) {
    return this.enqueue(id, async row => {
      const candidates = await this.client.query(api.lessons.listRecovery, { lessonId: row._id });
      const candidate = candidates.find(value => value._id === recoveryId);
      if (!candidate) throw new PreflightError("Recovery revision is no longer available.");
      const revision = await this.client.mutation(api.lessons.saveDraft, { lessonId: row._id, expectedRevision: row.revision, document: candidate.document, metadata: candidate.metadata });
      const restored = { ...row, draft: candidate.document, metadata: candidate.metadata, revision };
      this.rows.set(id, restored);
      return restored;
    });
  }
}
