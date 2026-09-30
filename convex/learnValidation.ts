import { ConvexError } from "convex/values";
import { LEARN_LIMITS, type LessonDocument, type lessonMeta } from "./learnModel";
import type { Infer } from "convex/values";

export interface LessonProblem { path: string; code: string; message: string }
export function safeLessonLink(value: string): boolean {
  if (!value || value.length > 2048 || /[\s\u0000-\u001f\u007f\\]/.test(value)) return false;
  try { const url = new URL(value); return ["https:", "http:", "mailto:"].includes(url.protocol) && !url.username && !url.password && (url.protocol === "mailto:" ? !!url.pathname : !!url.hostname); } catch { return false; }
}
const safeColor = (value: string) => /^(default|red|orange|yellow|green|blue|purple|pink|brown|gray|grey|black|white|#[0-9a-fA-F]{3,8})$/.test(value);
/** Parent lifecycle service can append these to its existing metadata checks. */
export function validateMetadataPresentation(metadata: Infer<typeof lessonMeta>): LessonProblem[] {
  const problems: LessonProblem[] = [];
  if (metadata.coverUrl !== undefined && metadata.coverUrl !== "" && (!safeLessonLink(metadata.coverUrl) || !/^https?:/.test(metadata.coverUrl))) problems.push({ path: "metadata.coverUrl", code: "LINK", message: "Use an absolute HTTP or HTTPS cover URL without credentials." });
  if (metadata.authorDisplay !== undefined && (metadata.authorDisplay.length > 200 || /[\u0000-\u001f\u007f]/.test(metadata.authorDisplay))) problems.push({ path: "metadata.authorDisplay", code: "LIMIT", message: "Use an author display name of at most 200 characters without control characters." });
  return problems;
}
export function validateDocument(document: LessonDocument): LessonProblem[] {
  const errors: LessonProblem[] = [];
  const problem = (path: string, code: string, message: string) => errors.push({ path, code, message });
  if (document.blocks.length > LEARN_LIMITS.blocks) problem("blocks", "LIMIT", `At most ${LEARN_LIMITS.blocks} blocks are allowed.`);
  if (new TextEncoder().encode(JSON.stringify(document)).byteLength > LEARN_LIMITS.documentBytes) problem("document", "LIMIT", "Lesson exceeds the document byte limit.");
  const ids = new Set<string>();
  const parents = new Map(document.blocks.map(b => [b.id, b.parentId]));
  document.blocks.forEach((block, i) => {
    const path = `blocks[${i}]`;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(block.id) || ids.has(block.id)) problem(`${path}.id`, "BLOCK_ID", "Use a unique stable block ID (letters, digits, hyphen or underscore).");
    ids.add(block.id);
    let parent = block.parentId;
    const ancestors = new Set([block.id]);
    while (parent) {
      if (!parents.has(parent) || ancestors.has(parent)) { problem(`${path}.parentId`, "PARENT", "Cyclic or missing parents are invalid."); break; }
      ancestors.add(parent);
      if (ancestors.size > 12) { problem(`${path}.parentId`, "LIMIT", "At most 12 nested block levels are allowed."); break; }
      parent = parents.get(parent);
    }
    if ("text" in block && block.text.length > LEARN_LIMITS.text) problem(`${path}.text`, "LIMIT", "Split oversized text into smaller blocks.");
    if ("inline" in block && block.inline) {
      if (block.inline.length > 1000 || block.inline.map(r => r.text).join("") !== block.text) problem(`${path}.inline`, "INLINE", "Use at most 1000 runs whose text matches the text fallback.");
      for (const run of block.inline) {
        if (run.href !== undefined && !safeLessonLink(run.href)) problem(`${path}.inline`, "LINK", "Use an absolute HTTP, HTTPS or mailto link without credentials or control characters.");
        for (const color of [run.marks?.textColor, run.marks?.backgroundColor]) if (color !== undefined && !safeColor(color)) problem(`${path}.inline`, "COLOR", "Use a named editor color or hex color.");
      }
    }
    for (const color of [block.presentation?.textColor, block.presentation?.backgroundColor]) if (color !== undefined && !safeColor(color)) problem(`${path}.presentation`, "COLOR", "Use a named editor color or hex color.");
    if (block.type === "code" && (block.language.length > 100 || !/^[A-Za-z0-9_+.#-]*$/.test(block.language))) problem(path, "LANGUAGE", "Use a short language identifier.");
    if (block.type === "image") {
      if ((block.name?.length ?? 0) > 2000 || (block.previewWidth !== undefined && (!Number.isFinite(block.previewWidth) || block.previewWidth <= 0 || block.previewWidth > 10000))) problem(path, "IMAGE", "Use a short image name and a preview width from 1 to 10000.");
      if ((block.credit?.length ?? 0) > 2000 || (block.creditUrl !== undefined && block.creditUrl !== "" && !safeLessonLink(block.creditUrl))) problem(path, "CREDIT", "Use a short credit and a safe absolute link.");
      if (block.annotations) {
        const items = block.annotations.items;
        if (items.length > 100 || new Set(items.map(a => a.id)).size !== items.length || items.some(a => !/^[A-Za-z0-9_-]{1,100}$/.test(a.id) || !a.label.trim() || a.label.length > 500 || (a.body?.length ?? 0) > 2000 || [a.x, a.y, a.w ?? 0, a.h ?? 0].some(n => !Number.isFinite(n) || n < 0 || n > 1) || a.x + (a.w ?? 0) > 1 || a.y + (a.h ?? 0) > 1)) problem(path, "ANNOTATIONS", "Use at most 100 uniquely identified hotspots within 0–1 image coordinates.");
      }
    }
    if (block.citations.length > 20 || block.conceptIds.length > 20) problem(path, "LIMIT", "At most 20 citations and concepts per block.");
    if (new Set(block.conceptIds).size !== block.conceptIds.length || block.conceptIds.some(id => !id || id.length > 200)) problem(`${path}.conceptIds`, "CONCEPT", "Use distinct stable concept IDs.");
    for (const [j, c] of block.citations.entries()) {
      const loc = c.locator;
      if ((loc.kind === "page" && (!Number.isSafeInteger(loc.page) || loc.page < 1)) || (loc.kind === "slide" && (!Number.isSafeInteger(loc.slide) || loc.slide < 1)) || (loc.kind === "section" && (!loc.label.trim() || loc.label.length > 300)) || (loc.kind === "time" && (!Number.isFinite(loc.start) || loc.start < 0 || (loc.end !== undefined && (!Number.isFinite(loc.end) || loc.end <= loc.start))))) problem(`${path}.citations[${j}]`, "LOCATOR", "Use a positive page/slide, named section or valid time interval.");
    }
    if (block.type === "youtube" && (!/^[A-Za-z0-9_-]{11}$/.test(block.videoId) || (block.start !== undefined && (!Number.isFinite(block.start) || block.start < 0)) || (block.end !== undefined && (!Number.isFinite(block.end) || block.end <= (block.start ?? 0))))) problem(path, "VIDEO", "Use a valid YouTube video ID and time interval.");
    if (block.type === "image" && !block.alt.trim()) problem(`${path}.alt`, "ALT", "Images need alternative text.");
    if (block.type === "table" && (block.rows.length > 100 || !block.rows.length || block.rows.some(r => r.length === 0 || r.length > 20 || r.length !== block.rows[0].length || r.some(c => c.length > 2000)) || !Number.isSafeInteger(block.headerRows) || block.headerRows < 0 || block.headerRows > block.rows.length)) problem(path, "TABLE", "Use a rectangular table up to 100 rows and 20 columns with a valid header count.");
  });
  return errors;
}
export function assertDocument(document: LessonDocument) {
  const problems = validateDocument(document);
  if (problems.length) throw new ConvexError({ code: "VALIDATION", problems: problems.map(p => ({ ...p })) });
}
