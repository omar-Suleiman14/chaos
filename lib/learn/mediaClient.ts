"use client";

import { useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth/client";
import { useConvex } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { LessonDocument, LessonBlock } from "../../convex/learnModel";
import { asBlocks, walk } from "./doc";
import type { LessonSource } from "./types";

export const MEDIA_MAX_BYTES = 25 * 1024 * 1024;
export const SOURCE_FILE_ACCEPT = ".pdf,.ppt,.pptx,.txt,image/png,image/jpeg,image/webp";
const kinds: Record<string, SourceMetadata["kind"]> = {
  "application/pdf": "pdf", "image/png": "image", "image/jpeg": "image", "image/webp": "image",
  "application/vnd.ms-powerpoint": "slides", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "slides", "text/plain": "file",
};
export type SourceMetadata = Doc<"learnSources">["metadata"];
export type SourceAccess = Pick<Doc<"learnSources">, "metadataVisibility" | "contentVisibility">;
export type NativeSource = LessonSource & SourceAccess & { nativeKind: SourceMetadata["kind"]; origin: string };
type Client = Pick<ConvexReactClient, "query" | "mutation">;
export type NativeCitation = LessonBlock["citations"][number];

export function sourceView(source: { _id: Id<"learnSources">; metadata: SourceMetadata } & SourceAccess): NativeSource {
  const { metadata } = source;
  const file = ["pdf", "slides", "image", "file"].includes(metadata.kind);
  return { id: source._id, kind: metadata.kind === "url" ? "link" : metadata.kind === "image" || metadata.kind === "file" ? "reference" : metadata.kind,
    nativeKind: metadata.kind, origin: metadata.origin, title: metadata.title, author: metadata.author, license: metadata.license, url: metadata.url,
    ...(file ? { fileId: sourceReference(source._id) } : {}), metadataVisibility: source.metadataVisibility, contentVisibility: source.contentVisibility };
}
export function sourceReference(id: string) { return "chaos-source:" + id; }
export function sourceIds(document?: LessonDocument | null, editorContent?: unknown): string[] {
  const ids = new Set<string>();
  for (const block of document?.blocks ?? []) {
    block.citations.forEach(c => ids.add(c.sourceId));
    if (block.type === "source" || block.type === "image") ids.add(block.sourceId);
  }
  for (const { block } of walk(asBlocks(editorContent))) {
    if (block.type === "source" && block.props.sourceId) ids.add(String(block.props.sourceId));
    if (block.type === "image" && String(block.props.url ?? "").startsWith("chaos-source:")) ids.add(String(block.props.url).slice(13));
  }
  return [...ids];
}
export function parseCitationLocator(raw: string): NativeCitation["locator"] {
  const text = raw.trim().replace(/[٠-٩]/g, value => String("٠١٢٣٤٥٦٧٨٩".indexOf(value)));
  if (!text || text.length > 300) throw new Error("Choose a page, slide, time range or section (up to 300 characters).");
  const numbered = text.match(/^(pages?|pp?\.?|صفحة|ص\.?|slides?|شريحة)\s*(\d+)$/i);
  if (numbered) {
    const number = Number(numbered[2]);
    if (!Number.isSafeInteger(number) || number < 1) throw new Error("Page and slide numbers must be positive integers.");
    return /^(slides?|شريحة)$/i.test(numbered[1]) ? { kind: "slide", slide: number } : { kind: "page", page: number };
  }
  const time = text.match(/^(\d+(?::\d{2}){1,2})(?:\s*[-–]\s*(\d+(?::\d{2}){1,2}))?$/);
  if (time) {
    const seconds = (value: string) => {
      const parts = value.split(":").map(Number);
      if (parts.slice(1).some(n => n > 59)) throw new Error("Minutes and seconds must be below 60.");
      const result = parts.reduce((sum, n) => sum * 60 + n, 0);
      if (!Number.isSafeInteger(result)) throw new Error("Invalid source time.");
      return result;
    };
    const start = seconds(time[1]), end = time[2] ? seconds(time[2]) : undefined;
    if (end !== undefined && end <= start) throw new Error("The end time must be after the start time.");
    return { kind: "time", start, ...(end === undefined ? {} : { end }) };
  }
  if (/^(pages?|pp?\.?|صفحة|ص\.?|slides?|شريحة)\s*[-\d]/i.test(text) || /^\d+:/.test(text)) throw new Error("Use one exact page/slide or a valid time range.");
  return { kind: "section", label: text };
}
export function replaceBlockCitation(document: LessonDocument, blockId: string, citation: NativeCitation, previous?: NativeCitation): LessonDocument {
  if (!document.blocks.some(block => block.id === blockId)) throw new Error("The cited block is no longer in this draft.");
  return { ...document, blocks: document.blocks.map(block => {
    if (block.id !== blockId) return block;
    const citations = block.citations.filter(value => !previous || JSON.stringify(value) !== JSON.stringify(previous));
    if (!citations.some(value => JSON.stringify(value) === JSON.stringify(citation))) citations.push(citation);
    return { ...block, citations };
  }) };
}
export function detachSource(document: LessonDocument, sourceId: string): LessonDocument {
  if (document.blocks.some(block => block.type === "image" && block.sourceId === sourceId)) throw new Error("Remove the image block before detaching its source.");
  const removed = new Set(document.blocks.filter(block => block.type === "source" && block.sourceId === sourceId).map(block => block.id));
  if (document.blocks.some(block => block.parentId && removed.has(block.parentId))) throw new Error("Move child blocks out of the source card before detaching it.");
  return { ...document, blocks: document.blocks.filter(block => !removed.has(block.id)).map(block => ({ ...block, citations: block.citations.filter(c => c.sourceId !== sourceId) })) };
}

/** Never returns storage URLs or persists authenticated object URLs. */
export class LearnMediaClient {
  private objectUrls = new Set<string>();
  private disposed = false;
  constructor(private client: Client, private getToken: () => Promise<string | null>, private site: string, private request: typeof fetch = fetch) {}
  private endpoint(path: string) {
    if (!this.site) throw new Error("The Learn source server is not configured.");
    const url = new URL(path, this.site);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("The source server must use HTTPS.");
    return url;
  }
  private async authorized(url: URL, init: RequestInit = {}, allowAnonymous = false) {
    const token = await this.getToken();
    if (!token && !allowAnonymous) throw new Error("Sign in before accessing source files.");
    const response = await this.request(url.toString(), { ...init, headers: { ...init.headers, ...(token ? { Authorization: "Bearer " + token } : {}) }, credentials: "omit", cache: "no-store", redirect: "error" });
    if (!response.ok) throw new Error(response.status === 413 ? "Files can be at most 25 MiB." : response.status === 415 ? "Unsupported file type or file signature." : "Source access failed (" + response.status + ").");
    return response;
  }
  async upload(file: File, input: { title?: string; origin?: string } = {}) {
    if (!file.size || file.size > MEDIA_MAX_BYTES) throw new Error("Choose a nonempty file up to 25 MiB.");
    const type = file.type.toLowerCase();
    if (!kinds[type]) throw new Error("Upload a PDF, PowerPoint, plain text, PNG, JPEG or WebP file.");
    const url = this.endpoint("/learn/sources/upload");
    url.searchParams.set("title", (input.title?.trim() || file.name || "Pasted image").slice(0, 200));
    url.searchParams.set("origin", (input.origin?.trim() || file.name || "Pasted image").slice(0, 500));
    const response = await this.authorized(url, { method: "POST", headers: { "Content-Type": type }, body: file });
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || !("sourceId" in value) || typeof value.sourceId !== "string" || !value.sourceId) throw new Error("The upload did not return a stable source ID.");
    return sourceReference(value.sourceId);
  }
  async read(id: string): Promise<NativeSource> {
    const source = await this.client.query(api.learnSources.getMetadata, { sourceId: id as Id<"learnSources"> });
    if (!source) throw new Error("Source metadata is unavailable or access was revoked.");
    return sourceView(source);
  }
  async resolve(reference: string) {
    if (!reference.startsWith("chaos-source:")) throw new Error("Upload this image to Chaos before using it. Local and external image URLs are not durable source references.");
    const id = reference.slice(13);
    const route = await this.client.query(api.learnSources.getContentUrl, { sourceId: id as Id<"learnSources"> });
    if (!route) throw new Error("Source file access is unavailable or was revoked.");
    const url = new URL(route), expected = this.endpoint("/learn/sources/content");
    if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.searchParams.get("sourceId") !== id || url.username || url.password) throw new Error("Unexpected source content route.");
    const response = await this.authorized(url, {}, true);
    const blob = await response.blob();
    if (this.disposed) throw new Error("The media editor has closed.");
    const objectUrl = URL.createObjectURL(blob);
    this.objectUrls.add(objectUrl);
    return objectUrl;
  }
  async saveSource(value: NativeSource, file?: File): Promise<NativeSource> {
    if (!value.title.trim() || !value.origin.trim()) throw new Error("Add a source title and origin.");
    if (value.url) { const url = new URL(value.url); if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use an HTTPS link without credentials."); }
    if (file && value.id) throw new Error("Attach a new source to replace a file; existing source files stay immutable.");
    let id = value.id;
    if (file) id = (await this.upload(file, value)).slice(13);
    if (id) {
      const original = await this.read(id);
      const metadata: SourceMetadata = { title: value.title.trim(), kind: original.nativeKind, origin: original.origin,
        ...(value.author?.trim() ? { author: value.author.trim() } : {}), ...(value.license?.trim() ? { license: value.license.trim() } : {}), ...(value.url?.trim() ? { url: value.url.trim() } : {}) };
      await this.client.mutation(api.learnSources.update, { sourceId: id as Id<"learnSources">, metadata, metadataVisibility: value.metadataVisibility, contentVisibility: value.contentVisibility });
    } else {
      if (!["url", "video", "reference"].includes(value.nativeKind)) throw new Error("Choose a file for this source.");
      id = await this.client.mutation(api.learnSources.create, { metadata: { title: value.title.trim(), kind: value.nativeKind, origin: value.origin.trim(),
        ...(value.author?.trim() ? { author: value.author.trim() } : {}), ...(value.license?.trim() ? { license: value.license.trim() } : {}), ...(value.url?.trim() ? { url: value.url.trim() } : {}) }, metadataVisibility: value.metadataVisibility, contentVisibility: value.contentVisibility });
    }
    return this.read(id);
  }
  async saveDocument(row: Doc<"lessons">, document: LessonDocument) {
    return this.client.mutation(api.lessons.saveDraft, { lessonId: row._id, expectedRevision: row.revision, document });
  }
  activate() { this.disposed = false; }
  dispose() { this.disposed = true; this.objectUrls.forEach(url => URL.revokeObjectURL(url)); this.objectUrls.clear(); }
}

export function useLearnMediaClient() {
  const client = useConvex();
  const { getToken, userId } = useAuth();
  const media = useMemo(() => { void userId; return new LearnMediaClient(client, () => getToken({ template: "convex", skipCache: true }), process.env.NEXT_PUBLIC_CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\.cloud\/?$/, ".site") || ""); }, [client, getToken, userId]);
  useEffect(() => { media.activate(); return () => media.dispose(); }, [media]);
  return media;
}
