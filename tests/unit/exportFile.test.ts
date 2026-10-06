import { describe, expect, it } from "vitest";
import { buildExportFile, exportFile, WORKER_MIN_ROWS } from "@/lib/exportFile";

const text = (bytes: Uint8Array) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);

describe("export files", () => {
  it("writes CSV with a BOM, quoted cells and neutralised formulas", () => {
    const csv = text(buildExportFile({ kind: "csv", rows: [["Name", "Score"], ["=HYPERLINK(\"x\")", -5], ["a \"quote\"", null]] }));
    expect(csv).toBe("﻿\"Name\",\"Score\"\r\n\"'=HYPERLINK(\"\"x\"\")\",\"-5\"\r\n\"a \"\"quote\"\"\",\"\"");
  });

  it("writes XLSX as a zip and JSON as indented text", () => {
    const xlsx = buildExportFile({ kind: "xlsx", rows: [["a", 1]] });
    expect([...xlsx.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(JSON.parse(text(buildExportFile({ kind: "json", value: { responses: [1, 2] } })))).toEqual({ responses: [1, 2] });
  });

  it("builds large files inline when no worker is available", async () => {
    const rows = Array.from({ length: WORKER_MIN_ROWS + 1 }, (_, i) => [i]);
    expect(text(await exportFile({ kind: "csv", rows })).split("\r\n")).toHaveLength(WORKER_MIN_ROWS + 1);
  });
});
