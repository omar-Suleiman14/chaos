"use client";

import { useStableQueries } from "@/lib/stableQueries";
import { useEffect, useState } from "react";
import { useConvexAuth, usePaginatedQuery, useQuery, type ConvexReactClient } from "convex/react";
import type { FunctionReference } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { CurriculumNode, FlashcardSet, Folder, FolderItem, Highlight, MyCourse, PersonalNote, SavedItem } from "./types";

type Client = Pick<ConvexReactClient, "query" | "mutation">;
type Page<T> = { page: T[]; isDone: boolean; continueCursor: string };
const key = () => crypto.randomUUID().replaceAll("-", "_");
export function useLibraryAnnotations() {
  const auth = useConvexAuth();
  const page = usePaginatedQuery(api.learnLibrary.annotations, auth.isAuthenticated ? {} : "skip", { initialNumItems: 25 });
  useEffect(() => { if (page.status === "CanLoadMore") page.loadMore(25); }, [page.status, page.loadMore]);
  return auth.isLoading || (auth.isAuthenticated && page.status !== "Exhausted") ? undefined : auth.isAuthenticated ? page.results : [];
}
export function useLibraryFolders(): Folder[] | undefined {
  const auth = useConvexAuth();
  const page = usePaginatedQuery(api.learnLibrary.folders, auth.isAuthenticated ? {} : "skip", { initialNumItems: 25 });
  useEffect(() => { if (page.status === "CanLoadMore") page.loadMore(25); }, [page.status, page.loadMore]);
  return auth.isLoading || (auth.isAuthenticated && page.status !== "Exhausted") ? undefined : page.results.map(r => ({ id: r._id, ownerId: r.ownerId, name: r.name, parentId: r.parentId ?? undefined, createdAt: r.createdAt, updatedAt: r.updatedAt }));
}
export function useLibraryMembers() {
  const auth = useConvexAuth();
  const page = usePaginatedQuery(api.learnLibrary.members, auth.isAuthenticated ? {} : "skip", { initialNumItems: 25 });
  useEffect(() => { if (page.status === "CanLoadMore") page.loadMore(25); }, [page.status, page.loadMore]);
  return auth.isLoading || (auth.isAuthenticated && page.status !== "Exhausted") ? undefined : auth.isAuthenticated ? page.results : [];
}
export function useLibraryFolderItems(): FolderItem[] | undefined {
  return useLibraryMembers()?.flatMap(r => r.asset.kind === "collection" ? [] : [{ folderId: r.folderId, kind: r.asset.kind, refId: r.asset.id, title: r.asset.kind === "lesson" ? "Lesson" : r.asset.kind === "source" ? "Source" : "Assessment", addedAt: r.createdAt }]);
}

/** Every branch is paged reactively; later pages are discarded when an earlier cursor changes. */
function useBranches<T>(query: FunctionReference<"query">, parents: string[] | undefined, field?: string): T[] | undefined {
  const roots = parents ?? [];
  const [cursors, setCursors] = useState<Record<string, string[]>>({});
  const requests = Object.fromEntries(roots.flatMap(id => [null, ...(cursors[id] ?? [])].map((cursor, i) => [`${id}:${i}`, { query, args: { ...(field ? { [field]: id } : {}), paginationOpts: { cursor, numItems: 25 } } }])));
  const results = useStableQueries(requests);
  const next: Record<string, string[]> = {};
  let ready = parents !== undefined;
  const rows: T[] = [];
  for (const id of roots) {
    next[id] = [];
    for (let i = 0; i <= (cursors[id]?.length ?? 0); i++) {
      const result = results[`${id}:${i}`] as Page<T> | Error | undefined;
      if (result instanceof Error) throw result;
      if (!result) { ready = false; break; }
      rows.push(...result.page);
      if (result.isDone) break;
      next[id].push(result.continueCursor);
      if (cursors[id]?.[i] !== result.continueCursor) { ready = false; break; }
    }
  }
  const signature = JSON.stringify(next);
  useEffect(() => { setCursors(current => JSON.stringify(current) === signature ? current : JSON.parse(signature)); }, [signature]);
  return ready ? rows : undefined;
}
export function useLibraryCurriculum(): CurriculumNode[] | undefined {
  const institutions = useBranches<Doc<"curriculumInstitutions">>(api.curricula.listInstitutions, ["root"]);
  const programs = useBranches<Doc<"curriculumPrograms">>(api.curricula.listPrograms, institutions?.map(r => r._id), "institutionId");
  const versions = useBranches<Doc<"curriculumVersions">>(api.curricula.listVersions, programs?.map(r => r._id), "programId");
  const nodes = useBranches<Doc<"curriculumNodes">>(api.curricula.listNodes, versions?.map(r => r._id), "versionId");
  if (!institutions || !programs || !versions || !nodes) return undefined;
  // The canonical catalog has no "current" flag. Do not infer currency from creation time.
  return [...institutions.map(r => ({ id: r._id, name: r.name, kind: "university" as const })), ...programs.map(r => ({ id: r._id, name: r.name, kind: "program" as const, parentId: r.institutionId })), ...versions.map(r => ({ id: r._id, name: r.name, kind: "version" as const, parentId: r.programId })), ...nodes.map(r => ({ id: r._id, name: r.name, kind: r.kind === "subject" || r.kind === "custom" ? "module" as const : r.kind, parentId: r.parentId ?? r.versionId, code: r.key }))];
}
export function useLibraryCourses(): MyCourse[] | undefined {
  const auth = useConvexAuth(), nodes = useLibraryCurriculum();
  const follows = useQuery(api.learnPersonal.listModuleFollows, auth.isAuthenticated ? {} : "skip");
  if (auth.isLoading || !nodes || (auth.isAuthenticated && follows === undefined)) return undefined;
  const byId = new Map(nodes.map(n => [n.id, n]));
  return (follows ?? []).filter(r => r.followed).map(r => {
    let node = byId.get(r.nodeId);
    while (node?.parentId && node.kind !== "version") node = byId.get(node.parentId);
    return { moduleId: r.nodeId, versionId: node?.kind === "version" ? node.id : "", addedAt: r._creationTime };
  });
}
export function annotationSave(r: Doc<"learnPersonal">): SavedItem {
  return { id: r.key, kind: r.key.startsWith("lesson_") ? "lesson" : "block", lessonId: r.lessonId, lessonTitle: "", blockId: r.blockId, excerpt: r.anchor?.quote, createdAt: r._creationTime };
}
export function annotationHighlight(r: Doc<"learnPersonal">): Highlight {
  const color = r.key.split("_")[1];
  return { id: r.key, lessonId: r.lessonId, blockId: r.blockId, quote: r.anchor?.quote ?? "", offset: r.anchor?.start ?? 0, color: color === "green" || color === "blue" || color === "pink" ? color : "yellow", createdAt: r._creationTime };
}
export function annotationNote(r: Doc<"learnPersonal">): PersonalNote {
  return { id: r.key, lessonId: r.lessonId, blockId: r.blockId, body: r.note, createdAt: r._creationTime, updatedAt: r.updatedAt };
}
export function flashcardUi(r: Doc<"flashcardSets">): FlashcardSet {
  return { id: r._id, ownerId: r.ownerId, ownerName: "Chaos creator", title: r.title, description: "", cards: r.cards, visibility: r.visibility === "restricted" ? "private" : r.visibility, ...(r.visibility === "restricted" && r.audienceTeamId ? { teamId: r.audienceTeamId } : {}), createdAt: r._creationTime, updatedAt: r.updatedAt };
}
export function useLibraryFlashcardRows() {
  const auth = useConvexAuth();
  const page = usePaginatedQuery(api.learnLibrary.flashcards, auth.isAuthenticated ? {} : "skip", { initialNumItems: 25 });
  useEffect(() => { if (page.status === "CanLoadMore") page.loadMore(25); }, [page.status, page.loadMore]);
  return auth.isLoading || (auth.isAuthenticated && page.status !== "Exhausted") ? undefined : auth.isAuthenticated ? page.results : [];
}
export function useLibraryFlashcards() { return useLibraryFlashcardRows()?.filter(r => !r.archived).map(flashcardUi); }
export function useLibraryCollections() {
  const auth = useConvexAuth();
  const page = usePaginatedQuery(api.learnLibrary.collections, auth.isAuthenticated ? {} : "skip", { initialNumItems: 25 });
  useEffect(() => { if (page.status === "CanLoadMore") page.loadMore(25); }, [page.status, page.loadMore]);
  return auth.isLoading || (auth.isAuthenticated && page.status !== "Exhausted") ? undefined : page.results;
}

/** One instance per signed-in viewer. Failed writes never become local success. */
export class DurableLibraryClient {
  private rows = new Map<string, Doc<"learnPersonal">>();
  private tails = new Map<string, Promise<unknown>>();
  private sets = new Map<string, Doc<"flashcardSets">>();
  constructor(private client: Client) {}
  observe(rows: Doc<"learnPersonal">[]) { for (const row of rows) if (!this.rows.has(row.key)) this.rows.set(row.key, row); }
  observeFlashcards(rows: Doc<"flashcardSets">[]) { for (const row of rows) if (!this.sets.has(row._id)) this.sets.set(row._id, row); }
  private queue<T>(id: string, work: () => Promise<T>): Promise<T> {
    const next = (this.tails.get(id) ?? Promise.resolve()).catch(() => undefined).then(work);
    this.tails.set(id, next);
    return next;
  }
  async published(id: string) {
    const version = await this.client.query(api.lessons.getPublished, { lessonId: id as Id<"lessons"> });
    if (!version) throw new Error("Publish or open an accessible published lesson first.");
    return version;
  }
  put(input: { key?: string; lessonId: string; blockId?: string; kind: "save" | "highlight" | "note"; note?: string; anchor?: { start: number; end: number; quote: string } }) {
    const snapshot = structuredClone(input);
    input = snapshot;
    const annotationKey = input.key ?? key();
    return this.queue(annotationKey, async () => {
      const prior = this.rows.get(annotationKey);
      const version = prior ? undefined : await this.published(input.lessonId);
      const blockId = input.blockId ?? prior?.blockId ?? version?.document.blocks[0]?.id;
      if (!blockId) throw new Error("This published lesson has no blocks to save.");
      if (input.anchor && version) { const block = version.document.blocks.find(b => b.id === blockId); if (!block || !("text" in block) || block.text.slice(input.anchor.start, input.anchor.end) !== input.anchor.quote) throw new Error("The selected text and UTF-16 offsets do not exactly match this published block. Select text inside one block without controls or citations; your selection was not changed or saved."); }
      const row = await this.client.mutation(api.learnPersonal.put, { key: annotationKey, lessonId: input.lessonId as Id<"lessons">, versionId: prior?.versionId ?? version!._id, blockId, kind: input.kind, note: input.note ?? "", ...(input.anchor ? { anchor: input.anchor } : {}), expectedRevision: prior?.revision ?? 0 });
      this.rows.set(row.key, row);
      return row.key;
    });
  }
  remove(id: string) {
    return this.queue(id, async () => {
      const row = this.rows.get(id);
      if (!row) throw new Error("Reload Saved before removing this annotation.");
      const revision = await this.client.mutation(api.learnPersonal.remove, { key: id, expectedRevision: row.revision });
      this.rows.set(id, { ...row, deleted: true, revision });
    });
  }
  follow(nodeId: string, followed: boolean) {
    return this.queue(nodeId, async () => {
      const rows = await this.client.query(api.learnPersonal.listModuleFollows, {});
      return this.client.mutation(api.learnPersonal.followModule, { nodeId: nodeId as Id<"curriculumNodes">, followed, expectedRevision: rows.find(r => r.nodeId === nodeId)?.revision ?? 0 });
    });
  }
  async moveAsset(kind: FolderItem["kind"], id: string, folderId?: string) {
    if (kind === "flashcards") throw new Error("The folder backend does not support flashcard membership.");
    const asset = kind === "lesson" ? { kind, id: id as Id<"lessons"> } : kind === "form" ? { kind, id: id as Id<"forms"> } : kind === "quiz" ? { kind, id: id as Id<"quizzes"> } : { kind: "source" as const, id: id as Id<"learnSources"> };
    let cursor: string | null = null;
    const members: Doc<"folderMembers">[] = [];
    do {
      const page: Page<Doc<"folderMembers">> = await this.client.query(api.learnLibrary.members, { paginationOpts: { cursor, numItems: 25 } });
      members.push(...page.page.filter(r => r.asset.kind === kind && r.asset.id === id));
      cursor = page.isDone ? null : page.continueCursor;
    } while (cursor);
    // Add first: a rejected destination never removes the existing memberships.
    if (folderId) await this.client.mutation(api.folders.addMember, { folderId: folderId as Id<"folders">, asset });
    for (const member of members) if (member.folderId !== folderId) await this.client.mutation(api.folders.removeMember, { memberId: member._id });
  }
  async review(setId: string, cardId: string, knewIt: boolean) {
    return this.queue(`${setId}:${cardId}`, async () => {
      const version = await this.client.query(api.flashcards.getPublished, { setId: setId as Id<"flashcardSets"> });
      if (!version) throw new Error("Publish this set before recording study evidence.");
      const summary = await this.client.query(api.flashcardStudy.reviewSchedule, { versionId: version._id, now: Date.now(), limit: 100 });
      const state = summary.items.find(r => r.cardId === cardId);
      if (!state) throw new Error("This card is outside the published study queue. Study the current published cards.");
      return this.client.mutation(api.flashcardStudy.review, { versionId: version._id, cardId, rating: knewIt ? "good" : "again", eventId: key(), expectedRevision: state.revision });
    });
  }
  async updateFlashcards(id: string, patch: Partial<Pick<FlashcardSet, "title" | "description" | "cards" | "visibility" | "teamId" | "lessonId">>) {
    patch = structuredClone(patch);
    return this.queue(id, async () => {
      if (patch.description !== undefined || patch.lessonId !== undefined) throw new Error("Flashcard descriptions and lesson links are not supported by this backend.");
      const row = this.sets.get(id) ?? await this.client.query(api.learnLibrary.flashcard, { id });
      if (!row) throw new Error("Flashcard set not found.");
      this.sets.set(id, row);
      let revision = row.revision;
      if (patch.title !== undefined || patch.cards !== undefined) revision = await this.client.mutation(api.flashcards.save, { setId: row._id, expectedRevision: revision, title: patch.title ?? row.title, cards: patch.cards?.map(c => ({ id: c.id, front: c.front, back: c.back, conceptIds: row.cards.find(old => old.id === c.id)?.conceptIds ?? [] })) ?? row.cards });
      this.sets.set(id, { ...row, revision, title: patch.title ?? row.title, cards: patch.cards?.map(c => ({ id: c.id, front: c.front, back: c.back, conceptIds: row.cards.find(old => old.id === c.id)?.conceptIds ?? [] })) ?? row.cards });
      if (patch.visibility === "unlisted") throw new Error("Unlisted flashcards are not supported. Choose private or public.");
      if (patch.teamId) {
        // Team-only: published, readable by members of that Business team.
        await this.client.mutation(api.flashcards.publish, { setId: row._id, expectedRevision: revision, visibility: "restricted", teamId: patch.teamId as Id<"businessTeams"> });
        this.sets.set(id, { ...this.sets.get(id)!, revision: revision + 1, visibility: "restricted", audienceTeamId: patch.teamId as Id<"businessTeams"> });
      } else if (patch.visibility) {
        if (patch.visibility === "private") await this.client.mutation(api.flashcards.setLifecycle, { setId: row._id, expectedRevision: revision, action: "unpublish" });
        else await this.client.mutation(api.flashcards.publish, { setId: row._id, expectedRevision: revision, visibility: patch.visibility });
        this.sets.set(id, { ...this.sets.get(id)!, revision: revision + 1, visibility: patch.visibility });
      }
    });
  }
}
