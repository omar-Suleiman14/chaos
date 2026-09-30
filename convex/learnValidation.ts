import { ConvexError } from "convex/values";
import { LEARN_LIMITS, type LessonDocument } from "./learnModel";

export interface LessonProblem { path: string; code: string; message: string }
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
