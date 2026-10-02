import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { guessSheetRoles, sheetDefinition, sheetQuestions, sheetRowToField, SHEET_TEMPLATE } from "@/lib/formImporters";
import { buildXlsx, parseCsv, readXlsx } from "@/lib/xlsx";
import { checkDefinition } from "@/convex/formLogic";
import { captureHidden, checkEmailRules, checkHiddenFieldNames, hiddenFieldNameError, normalizeEmailRules } from "@/convex/formRespondent";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, newlines in cells, CRLF and a BOM", () => {
    expect(parseCsv("﻿a,\"b, c\",\"say \"\"hi\"\"\"\r\n1,\"two\nlines\",3")).toEqual([["a", "b, c", "say \"hi\""], ["1", "two\nlines", "3"]]);
  });
  it("detects semicolon and tab separators", () => {
    expect(parseCsv("a;b;c\n1;2;3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

/** A minimal deflated workbook with shared strings, as Excel writes it. */
function excelStyleXlsx(): Uint8Array {
  const enc = new TextEncoder();
  const files: [string, string][] = [
    ["xl/workbook.xml", `<workbook xmlns:r="r"><sheets><sheet name="Q" sheetId="1" r:id="rId7"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId7" Type="ws" Target="worksheets/data.xml"/></Relationships>`],
    ["xl/sharedStrings.xml", `<sst><si><t>Question</t></si><si><r><t>Capital</t></r><r><t xml:space="preserve"> of France?</t></r></si><si><t>Paris &amp; co</t></si></sst>`],
    ["xl/worksheets/data.xml", `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="3"><c r="A3" t="s"><v>1</v></c><c r="C3" t="s"><v>2</v></c><c r="D3"><v>4</v></c></row></sheetData></worksheet>`],
  ];
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, xml] of files) {
    const n = enc.encode(name);
    const raw = enc.encode(xml);
    const data = new Uint8Array(deflateRawSync(raw));
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(8, 8, true);
    local.setUint32(18, data.length, true); local.setUint32(22, raw.length, true); local.setUint16(26, n.length, true);
    chunks.push(new Uint8Array(local.buffer), n, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(10, 8, true);
    entry.setUint32(20, data.length, true); entry.setUint32(24, raw.length, true); entry.setUint16(28, n.length, true); entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const c of all) { out.set(c, at); at += c.length; }
  return out;
}

describe("readXlsx", () => {
  it("reads back what buildXlsx writes", async () => {
    const rows = await readXlsx(buildXlsx([["Question", "Points"], ["2 < 3?", 5], ["", ""], ["Last", true]]));
    expect(rows).toEqual([["Question", "Points"], ["2 < 3?", "5"], [], ["Last", "TRUE"]]);
  });
  it("reads deflated Excel files through the workbook relationship, shared strings and rich text", async () => {
    const rows = await readXlsx(excelStyleXlsx());
    expect(rows).toEqual([["Question"], [], ["Capital of France?", "", "Paris & co", "4"]]);
  });
  it("rejects files that are not zips", async () => {
    await expect(readXlsx(new TextEncoder().encode("not a workbook"))).rejects.toThrow(/xlsx/);
  });
});

describe("question sheet mapping", () => {
  it("guesses columns from English and Arabic headers", () => {
    expect(guessSheetRoles(["Question", "Type", "Options", "Correct answer", "Points", "Explanation", "Required"]).roles)
      .toEqual(["question", "type", "options", "correct", "points", "explanation", "required"]);
    expect(guessSheetRoles(["السؤال", "A", "B", "الإجابة الصحيحة"]).roles).toEqual(["question", "option", "option", "correct"]);
    expect(guessSheetRoles(["What is 2+2?", "4"])).toEqual({ roles: ["question", "ignore"], hasHeader: false });
  });

  it("imports the template cleanly as a publishable quiz", () => {
    const { roles, hasHeader } = guessSheetRoles(SHEET_TEMPLATE[0]);
    const rows = sheetQuestions(SHEET_TEMPLATE, roles, hasHeader);
    expect(rows.map((r) => r.errors)).toEqual(rows.map(() => []));
    const def = sheetDefinition(rows, "Template").definition;
    expect(def.quiz).toEqual({ enabled: true });
    expect(def.fields.map((f) => f.type)).toEqual(["choice", "multi_choice", "choice", "dropdown", "textarea"]);
    const prime = def.fields[1];
    expect(prime.quiz?.correctOptionIds.map((id) => prime.options!.find((o) => o.id === id)!.label)).toEqual(["2", "5"]);
    expect(def.fields[3].quiz?.correctOptionIds).toEqual([def.fields[3].options![1].id]);
    expect(checkDefinition(def).errors).toEqual([]);
  });

  it("reports per-row problems without failing other rows", () => {
    const roles = ["question", "type", "options", "correct", "points"] as const;
    const bad = [
      ["", "choice", "a | b", "a", ""],
      ["Q", "quiz-thing", "", "", ""],
      ["Q", "choice", "only one", "", ""],
      ["Q", "choice", "a | b", "c", ""],
      ["Q", "choice", "a | b", "a | b", ""],
      ["Q", "choice", "a | b", "a", "lots"],
    ];
    const messages = bad.map((cells, i) => sheetRowToField(cells, [...roles], i + 2));
    expect(messages.every((r) => r.field === null && r.errors.length > 0)).toBe(true);
    expect(messages[3].errors[0]).toMatch(/not one of the options/);
    const ok = sheetRowToField(["Name?", "", "", "", ""], [...roles], 9);
    expect(ok.field).toMatchObject({ type: "text", label: "Name?" });
    const ignored = sheetRowToField(["Why?", "paragraph", "", "yes", ""], [...roles], 10);
    expect(ignored.field?.quiz).toBeUndefined();
    expect(ignored.warnings[0]).toMatch(/only choice questions/);
  });
});

describe("hidden fields", () => {
  it("validates names and keeps only declared, cleaned values", () => {
    expect(hiddenFieldNameError("source")).toBeNull();
    expect(hiddenFieldNameError("utm_campaign")).toBeNull();
    expect(hiddenFieldNameError("1st")).not.toBeNull();
    expect(hiddenFieldNameError("lang")).not.toBeNull();
    expect(() => checkHiddenFieldNames(["a", "A"])).toThrow(/twice/);
    expect(captureHidden(["source", "ref"], { source: "  insta\u0000gram ", other: "x", ref: "" })).toEqual({ source: "insta gram" });
    expect(captureHidden(["source"], { source: "x".repeat(900) })!.source).toHaveLength(500);
    expect(captureHidden(undefined, { source: "x" })).toBeUndefined();
  });
});

describe("email rules", () => {
  const rules = normalizeEmailRules([" Ana@Example.com "], ["@School.edu"]);
  const settings = { allowedEmails: rules.emails, allowedDomains: rules.domains };
  it("normalises and validates entries", () => {
    expect(rules).toEqual({ emails: ["ana@example.com"], domains: ["school.edu"] });
    expect(() => normalizeEmailRules(["nope"], [])).toThrow(/INVALID_SETTINGS/);
    expect(() => normalizeEmailRules([], ["not a domain"])).toThrow(/INVALID_SETTINGS/);
  });
  it("admits only verified listed emails or exact domains", () => {
    expect(checkEmailRules({}, null)).toBe("ok");
    expect(checkEmailRules(settings, { email: "ana@example.com", emailVerified: true })).toBe("ok");
    expect(checkEmailRules(settings, { email: "kid@school.edu", emailVerified: true })).toBe("ok");
    expect(checkEmailRules(settings, { email: "kid@evil.school.edu", emailVerified: true })).toBe("not_allowed");
    expect(checkEmailRules(settings, { email: "kid@school.edu.evil.com", emailVerified: true })).toBe("not_allowed");
    expect(checkEmailRules(settings, { email: "kid@school.edu" })).toBe("unverified");
    expect(checkEmailRules(settings, { email: "kid@school.edu", emailVerified: false })).toBe("unverified");
  });
});
