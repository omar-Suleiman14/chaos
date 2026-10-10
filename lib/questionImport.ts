import { emptyDefinition, LIMITS, type FormDefinition } from "../convex/formLogic";

const QUESTION_IMPORT_LIMITS = { bytes: 500_000, expandedBytes: 2_000_000, rows: 200, columns: 106, errors: 100 } as const;
export type ImportProblem = { row: number; column: string; message: string };
export class QuestionImportError extends Error {
  constructor(public readonly problems: ImportProblem[]) { super("QUESTION_IMPORT_INVALID"); }
}
function fail(row: number, column: string, message: string): never { throw new QuestionImportError([{ row, column, message }]); }

/** RFC4180 quotes, CRLF, multiline cells and UTF-8 BOM; no silent truncation. */
export function readQuestionCsv(text: string): string[][] {
  if (new TextEncoder().encode(text).length > QUESTION_IMPORT_LIMITS.bytes) fail(0, "file", "File exceeds 500000 bytes.");
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  const pushCell = () => { row.push(cell); cell = ""; closed = false; if (row.length > QUESTION_IMPORT_LIMITS.columns) fail(rows.length + 1, "row", "Too many columns."); };
  const pushRow = () => { pushCell(); rows.push(row); row = []; if (rows.length > QUESTION_IMPORT_LIMITS.rows + 1) fail(rows.length, "row", "At most 200 question rows are allowed."); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; continue; }
    if (c === ",") pushCell();
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; pushRow(); }
    else if (c === '"' && !cell && !closed) quoted = true;
    else { if (closed || c === '"') fail(rows.length + 1, String(row.length + 1), "Invalid CSV quoting."); cell += c; }
  }
  if (quoted) fail(rows.length + 1, String(row.length + 1), "Unclosed quoted cell.");
  if (cell || row.length || closed) pushRow();
  return rows;
}

/** Columns: question,type,option_1..option_100,correct,points,explanation.
 * correct contains 1-based option numbers separated by |. */
export function normalizeQuestionRows(rows: string[][], title: string): FormDefinition {
  if (!rows.length) fail(1, "header", "Missing header row.");
  if (!title.trim() || title.length > LIMITS.title) fail(0, "title", "Title must contain 1–200 characters.");
  if (rows.length > 201) fail(0, "file", "At most 200 question rows are allowed.");
  if (rows[0].length > QUESTION_IMPORT_LIMITS.columns) fail(1, "header", "Too many columns.");
  const headers = rows[0].map(h => h.trim().toLowerCase()); const errors: ImportProblem[] = [];
  const problem = (row: number, column: string, message: string) => { if (errors.length < 100) errors.push({ row, column, message }); };
  headers.forEach((h, i) => { if (!/^(question|type|correct|points|explanation|option_([1-9]|[1-9][0-9]|100))$/.test(h)) problem(1, String(i + 1), "Unknown column."); if (headers.indexOf(h) !== i) problem(1, h, "Duplicate column."); });
  for (const h of ["question", "correct"]) if (!headers.includes(h)) problem(1, h, "Required column missing.");
  const def = emptyDefinition(title.trim()); def.quiz = { enabled: true };
  rows.slice(1).forEach((cells, index) => {
    const r = index + 2; if (cells.every(c => !c.trim())) return;
    if (cells.length > headers.length || cells.length > QUESTION_IMPORT_LIMITS.columns) problem(r, "row", "Extra columns without headers.");
    const get = (h: string) => (cells[headers.indexOf(h)] ?? "").trim();
    const label = get("question"), type = get("type") || "choice";
    if (!label || label.length > LIMITS.label) problem(r, "question", "Question must contain 1–500 characters.");
    if (!["choice", "multi_choice", "dropdown"].includes(type)) problem(r, "type", "Use choice, multi_choice or dropdown.");
    const options: { id: string; label: string }[] = [];
    for (let n = 1; n <= 100; n++) { const value = get(`option_${n}`); if (value) { if (value.length > LIMITS.label) problem(r, `option_${n}`, "Option exceeds 500 characters."); if (options.some(o => o.label === value)) problem(r, `option_${n}`, "Duplicate option label."); options.push({ id: `o_${n}`, label: value }); } }
    if (options.length < 2) problem(r, "options", "At least two options are required.");
    const correct = get("correct").split("|").map(x => x.trim());
    if (correct.some(x => !/^[1-9]\d{0,2}$/.test(x) || !options.some(o => o.id === `o_${Number(x)}`)) || new Set(correct).size !== correct.length || (type !== "multi_choice" && correct.length !== 1)) problem(r, "correct", "Use existing 1-based option numbers; multiple answers require multi_choice.");
    const pointsText = get("points"), points = pointsText ? Number(pointsText) : 1;
    if ((pointsText && !/^\d+(\.\d+)?$/.test(pointsText)) || !Number.isFinite(points) || points < 0 || points > 1000) problem(r, "points", "Points must be a number between 0 and 1000.");
    const explanation = get("explanation"); if (explanation.length > LIMITS.description) problem(r, "explanation", "Explanation exceeds 5000 characters.");
    def.fields.push({ id: `import_q_${index + 1}`, type: type === "multi_choice" ? "multi_choice" : type === "dropdown" ? "dropdown" : "choice", label, required: true, options, quiz: { correctOptionIds: correct.map(x => `o_${Number(x)}`), points, ...(explanation ? { explanation } : {}) } });
  });
  if (!def.fields.length) problem(2, "question", "No questions found.");
  if (new TextEncoder().encode(JSON.stringify(def)).length > 500_000) problem(0, "file", "Normalized draft exceeds 500000 bytes.");
  if (errors.length) throw new QuestionImportError(errors);
  return def;
}

function xmlText(s: string): string {
  return s.replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (_, n: string, name: string) => n ? String.fromCodePoint(n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n)) : ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[name.toLowerCase()] ?? ""));
}
/** Reads one XLSX worksheet; rejects formulas, encryption, external links and ambiguous workbooks. */
export async function readQuestionXlsx(bytes: Uint8Array): Promise<string[][]> {
  if (bytes.length > QUESTION_IMPORT_LIMITS.bytes) fail(0, "file", "File exceeds 500000 bytes.");
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let end = bytes.length - 22;
    while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
    if (end < 0 || view.getUint32(end, true) !== 0x06054b50) fail(0, "file", "Invalid XLSX ZIP directory.");
    const count = view.getUint16(end + 10, true); if (count > 100 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) fail(0, "file", "Unsupported ZIP layout.");
    let offset = view.getUint32(end + 16, true), expanded = 0; const files = new Map<string, string>();
    for (let i = 0; i < count; i++) {
      if (view.getUint32(offset, true) !== 0x02014b50) fail(0, "file", "Invalid ZIP entry.");
      const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true), size = view.getUint32(offset + 20, true), rawSize = view.getUint32(offset + 24, true), nameLength = view.getUint16(offset + 28, true), local = view.getUint32(offset + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      expanded += rawSize; if (expanded > QUESTION_IMPORT_LIMITS.expandedBytes || flags & 1 || ![0, 8].includes(method) || name.includes("..") || files.has(name)) fail(0, "file", "Unsafe or oversized XLSX archive.");
      if (view.getUint32(local, true) !== 0x04034b50) fail(0, "file", "Invalid ZIP entry.");
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      if (start + size > bytes.length) fail(0, "file", "Truncated ZIP entry.");
      let data = bytes.slice(start, start + size);
      if (method === 8) {
        const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader(); const chunks: Uint8Array[] = []; let total = 0;
        while (true) { const part = await reader.read(); if (part.done) break; total += part.value.length; if (total > rawSize || total > 2_000_000) { await reader.cancel(); fail(0, "file", "Inflated XLSX exceeds declared size."); } chunks.push(part.value); }
        data = new Uint8Array(total); let at = 0; for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; }
      }
      if (data.length !== rawSize) fail(0, "file", "ZIP size mismatch.");
      const xml = new TextDecoder("utf-8", { fatal: true }).decode(data);
      if (/<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External/i.test(xml)) fail(0, "file", "External references are unsupported.");
      files.set(name, xml); offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    }
    const sheets = [...files.keys()].filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    if (sheets.length !== 1) fail(0, "file", "Provide exactly one worksheet.");
    const strings = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t => xmlText(t[1])).join(""));
    const rows: string[][] = [];
    for (const match of files.get(sheets[0])!.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = /\br="([A-Z]+)(\d+)"/.exec(match[1]); if (!ref) fail(0, "file", "Cell coordinate missing.");
      const r = Number(ref[2]); const c = [...ref[1]].reduce((n, x) => n * 26 + x.charCodeAt(0) - 64, 0);
      if (r < 1 || r > 201 || c > 106) fail(r, ref[1], "Worksheet exceeds row/column limits.");
      if (/<f\b/.test(match[2])) fail(r, ref[1], "Formula cells are not allowed; paste values instead.");
      const type = /\bt="([^"]+)"/.exec(match[1])?.[1]; const value = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(match[2])?.[1] ?? "";
      const text = type === "s" ? strings[Number(value)] : type === "inlineStr" ? [...match[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t => xmlText(t[1])).join("") : xmlText(value);
      if (text === undefined || (type && !["s", "inlineStr", "n", "str"].includes(type))) fail(r, ref[1], "Invalid or unsupported cell value.");
      while (rows.length < r) rows.push([]); const row = rows[r - 1]; while (row.length < c) row.push(""); row[c - 1] = text;
    }
    return rows;
  } catch (error) { if (error instanceof QuestionImportError) throw error; return fail(0, "file", "Malformed or unsupported XLSX file."); }
}
