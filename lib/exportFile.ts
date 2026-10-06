import { csvCell } from "@/convex/formLogic";
import { buildXlsx, type Cell } from "@/lib/xlsx";

/**
 * Builds download files (CSV, XLSX, JSON) for exports. Large ones are built in
 * a Web Worker: measured on a desktop, 5,000 responses × 40 columns take
 * ~200 ms as XLSX and 20,000 take ~2.4 s, all of it blocking input. Copying the
 * rows to the worker costs about a tenth of that. Small exports are built
 * inline, where starting a worker would cost more than it saves.
 */
export type ExportJob =
  | { kind: "csv" | "xlsx"; rows: Cell[][] }
  | { kind: "json"; value: unknown };

export const EXPORT_MIME = {
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json",
} as const;

const encoder = new TextEncoder();

/** The file's bytes. Pure: runs the same in the worker and on the main thread. */
export function buildExportFile(job: ExportJob): Uint8Array<ArrayBuffer> {
  if (job.kind === "xlsx") return buildXlsx(job.rows);
  if (job.kind === "json") return encoder.encode(JSON.stringify(job.value, null, 2));
  // csvCell neutralises spreadsheet formulas in respondent-supplied text.
  return encoder.encode("﻿" + job.rows.map((row) => row.map(csvCell).join(",")).join("\r\n"));
}

/** Rows (or JSON records) below this are built inline. */
export const WORKER_MIN_ROWS = 500;

const size = (job: ExportJob) => (job.kind === "json" ? (Array.isArray((job.value as { responses?: unknown })?.responses) ? (job.value as { responses: unknown[] }).responses.length : 0) : job.rows.length);

/** Builds the file off the main thread when it is large and workers are available. */
export async function exportFile(job: ExportJob): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof Worker === "undefined" || size(job) < WORKER_MIN_ROWS) return buildExportFile(job);
  let worker: Worker;
  try {
    worker = new Worker(new URL("./exportFile.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return buildExportFile(job);
  }
  try {
    return await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ bytes?: Uint8Array<ArrayBuffer>; error?: string }>) =>
        event.data.bytes ? resolve(event.data.bytes) : reject(new Error(event.data.error ?? "Export failed"));
      // A worker that cannot load (blocked by policy, old browser) still exports, just inline.
      worker.onerror = (event) => { event.preventDefault(); try { resolve(buildExportFile(job)); } catch (err) { reject(err); } };
      worker.postMessage(job);
    });
  } finally {
    worker.terminate();
  }
}
