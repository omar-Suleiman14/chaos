import { csvCell } from "@/convex/formLogic";
import { buildXlsx, type Cell } from "@/lib/xlsx";

/**
 * The pure half of exports, shared by lib/exportFile.ts and its worker. It lives
 * apart so the worker never imports the module that spawns it: that cycle made
 * Turbopack's build hang at "Creating an optimized production build".
 */
export type ExportJob =
  | { kind: "csv" | "xlsx"; rows: Cell[][] }
  | { kind: "json"; value: unknown };

const encoder = new TextEncoder();

/** The file's bytes. Pure: runs the same in the worker and on the main thread. */
export function buildExportFile(job: ExportJob): Uint8Array<ArrayBuffer> {
  if (job.kind === "xlsx") return buildXlsx(job.rows);
  if (job.kind === "json") return encoder.encode(JSON.stringify(job.value, null, 2));
  // csvCell neutralises spreadsheet formulas in respondent-supplied text.
  return encoder.encode("﻿" + job.rows.map((row) => row.map(csvCell).join(",")).join("\r\n"));
}
