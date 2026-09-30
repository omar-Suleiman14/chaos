/**
 * Form data-integrity suite (#210): values must come out of storage and exports exactly as they
 * went in, or be rejected loudly. Nothing is silently changed.
 */
import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";
import { checkAnswers, checkDefinition, csvCell, emptyDefinition } from "@/convex/formLogic";
import type { FormDefinition, FormField } from "@/convex/formLogic";
import { gradeQuiz } from "@/convex/formQuiz";
import { buildXlsx } from "@/lib/xlsx";

type T = ReturnType<typeof createTestConvex>;

// ── Helpers ─────────────────────────────────────────────────────────────────

const HOSTILE_LABELS = [
  "Red, green; blue",
  'He said "hello"',
  "Line one\nLine two",
  "=HYPERLINK(\"http://evil\")",
  "مرحبا، كيف حالك؟",
  "😀 👨‍👩‍👧 🇸🇦",
  "‏مرحبا‏ mixed RTL and English",
  "tab\there",
  "  padded  ",
];

async function publish(t: T, def: FormDefinition, settingsPatch: Record<string, unknown> = {}) {
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: def });
  const editor = await owner.query(api.forms.getFormForEditor, { formId });
  if (Object.keys(settingsPatch).length) {
    const { hasAccessCode: _h, accessCodeHash: _a, ...settings } = editor!.settings;
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...settings, ...settingsPatch } });
  }
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: editor!.draftRevision });
  const shareId = (await owner.query(api.forms.getFormForEditor, { formId }))!.shareId;
  return { owner, formId, shareId };
}

let keyCounter = 0;
const nextKey = () => `integrity-key-${String(++keyCounter).padStart(6, "0")}`;

function submit(t: T, shareId: string, answers: Record<string, string | number | string[] | Record<string, string>>, key = nextKey()) {
  return t.mutation(api.respond.submitResponse, { shareId, submissionKey: key, answers, language: "en", final: true, startedAt: Date.now() - 60_000 });
}

async function exportAll(owner: ReturnType<T["withIdentity"]>, formId: Id<"forms">) {
  const out = await owner.query(api.formResults.exportResponses, { formId, includePartial: true, includeSpam: true, paginationOpts: { numItems: 100, cursor: null } });
  return out!;
}

/** Minimal RFC 4180 reader, to prove csvCell output can be read back. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/** Reads the worksheet XML out of the stored (uncompressed) zip that buildXlsx writes. */
function sheetXml(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let at = 0;
  while (at + 30 < bytes.length && view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(18, true) === 0 ? 0 : view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    const name = decoder.decode(bytes.slice(at + 30, at + 30 + nameLength));
    const dataStart = at + 30 + nameLength + extraLength;
    if (name === "xl/worksheets/sheet1.xml") return decoder.decode(bytes.slice(dataStart, dataStart + size));
    at = dataStart + size;
  }
  throw new Error("worksheet not found");
}
const xmlText = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
/** Inline-string cells of an xlsx, unescaped, row by row. */
function xlsxStrings(bytes: Uint8Array): string[] {
  return [...sheetXml(bytes).matchAll(/<t xml:space="preserve">([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1]));
}

const field = (f: Partial<FormField> & Pick<FormField, "id" | "type">): FormField => ({ label: f.id, required: false, ...f });
function definition(fields: FormField[], extra: Partial<FormDefinition> = {}): FormDefinition {
  return { ...emptyDefinition("Integrity"), fields, ...extra };
}

// ── Every field type, entry to export ───────────────────────────────────────

const choices = HOSTILE_LABELS.slice(0, 5).map((label, i) => ({ id: `o${i}`, label }));

function allTypesDefinition(): FormDefinition {
  return definition([
    field({ id: "text", type: "text" }),
    field({ id: "para", type: "textarea" }),
    field({ id: "mail", type: "email" }),
    field({ id: "tel", type: "phone" }),
    field({ id: "site", type: "url" }),
    field({ id: "num", type: "number" }),
    field({ id: "day", type: "date" }),
    field({ id: "clock", type: "time" }),
    field({ id: "one", type: "choice", options: choices }),
    field({ id: "drop", type: "dropdown", options: choices }),
    field({ id: "many", type: "multi_choice", options: choices }),
    field({ id: "stars", type: "rating", max: 5 }),
    field({ id: "sc", type: "scale", min: 0, max: 10 }),
    field({ id: "rank", type: "ranking", options: choices }),
    field({ id: "grid", type: "matrix", rows: choices.slice(0, 2), options: [{ id: "c1", label: "Yes, always" }, { id: "c2", label: "No" }] }),
  ]);
}

const awkward = {
  text: "مرحبا 👋 \"quoted\", comma; semi\\slash",
  para: "line1\r\nline2\n\n  indented, \"q\"\n😀",
  mail: "user+tag@example.co.uk",
  tel: "+966 (50) 123-4567",
  site: "https://example.com/a?b=1&c=%D9%85",
  num: 0.30000000000000004,
  day: "2024-02-29",
  clock: "23:59",
  one: "o0",
  drop: "o2",
  many: ["o0", "o1", "o3"],
  stars: 5,
  sc: 0,
  rank: ["o4", "o3", "o2", "o1", "o0"],
  grid: { o0: "c1", o1: "c2" },
};

describe("every field type: entry, storage, inbox, export", () => {
  it("stores answers exactly as submitted", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, allTypesDefinition());
    const { responseId } = await submit(t, shareId, awkward);
    const stored = await t.run((ctx) => ctx.db.get("formResponses", responseId));
    // Deep equality: strings byte for byte (no trimming of textarea, no newline rewriting),
    // numbers to full double precision, arrays in order.
    expect(stored!.answers).toEqual(awkward);
    const exported = await exportAll(owner, formId);
    expect(exported.rows[0].answers).toEqual(awkward);
    expect(exported.rows).toHaveLength(1);
  });

  it("shows the option text the respondent chose in the inbox and export", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, allTypesDefinition());
    const { responseId } = await submit(t, shareId, awkward);
    const detail = await owner.query(api.formResults.getResponse, { responseId });
    const text = (id: string) => detail!.items.find((i) => i.fieldId === id)!.text;
    expect(text("one")).toBe("Red, green; blue");
    expect(text("many")).toBe(`${HOSTILE_LABELS[0]}, ${HOSTILE_LABELS[1]}, ${HOSTILE_LABELS[3]}`);
    expect(text("num")).toBe("0.30000000000000004");
    expect(text("day")).toBe("2024-02-29");
    expect(text("clock")).toBe("23:59");
    expect(text("para")).toBe(awkward.para);
    const cells = (await exportAll(owner, formId)).rows[0].cells;
    expect(cells.grid).toBeUndefined(); // matrix answers live in one column per row
    expect(cells["grid.o0"]).toBe("Yes, always");
    expect(cells["grid.o1"]).toBe("No");
    expect(cells.text).toBe(awkward.text);
  });

  it("rejects malformed values for each type instead of altering them", () => {
    const def = allTypesDefinition();
    const bad = (id: string, value: never) => checkAnswers(def, { [id]: value }, { partial: true }).errors[id];
    expect(bad("mail", "not an email" as never)).toBeTruthy();
    expect(bad("tel", "abc" as never)).toBeTruthy();
    expect(bad("site", "javascript:alert(1)" as never)).toBeTruthy();
    expect(bad("num", "12" as never)).toBeTruthy(); // a numeric string is not silently coerced
    // Non-finite numbers count as "no answer": never stored, never turned into zero.
    for (const n of [NaN, Infinity, -Infinity]) expect(checkAnswers(def, { num: n }).answers).toEqual({});
    expect(checkAnswers(definition([field({ id: "num", type: "number", required: true })]), { num: NaN }).errors.num).toBeTruthy();
    expect(bad("stars", 4.5 as never)).toBeTruthy();
    expect(bad("stars", 6 as never)).toBeTruthy();
    expect(bad("sc", 11 as never)).toBeTruthy();
    expect(bad("one", "nonexistent" as never)).toBeTruthy();
    expect(bad("many", ["o0", "o0"] as never)).toBeTruthy();
    expect(bad("rank", ["o0", "o1"] as never)).toBeTruthy();
    expect(bad("grid", { o0: "zzz" } as never)).toBeTruthy();
    expect(bad("text", "x".repeat(100_000) as never)).toBeTruthy();
  });
});

describe("dates and times do not drift", () => {
  const zones = ["UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago", "America/Los_Angeles", "Asia/Riyadh", "Australia/Lord_Howe"];
  const dates = ["2024-02-29", "1999-12-31", "2000-01-01", "2023-03-12", "2023-11-05", "2038-01-19", "0001-01-01"];
  const original = process.env.TZ;

  it("a date is the same calendar date in any timezone, and rejects a time component", async () => {
    try {
      for (const tz of zones) {
        process.env.TZ = tz;
        const def = definition([field({ id: "day", type: "date" })]);
        for (const day of dates) {
          const r = checkAnswers(def, { day });
          expect(r.errors, `${day} in ${tz}`).toEqual({});
          expect(r.answers.day).toBe(day);
        }
        for (const bad of ["2024-02-30", "2024-13-01", "2024-02-29T00:00:00Z", "2024-02-29 10:00", "29/02/2024", "٢٠٢٤-٠٢-٢٩"]) {
          expect(checkAnswers(def, { day: bad }).errors.day, `${bad} in ${tz}`).toBeTruthy();
        }
      }
    } finally {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
  });

  it("stores and exports the date string untouched", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, definition([field({ id: "day", type: "date" })]));
    for (const tz of zones) {
      process.env.TZ = tz;
      await submit(t, shareId, { day: "2024-02-29" });
    }
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    const rows = (await exportAll(owner, formId)).rows;
    expect(rows.map((r) => r.cells.day)).toEqual(zones.map(() => "2024-02-29"));
  });

  it("a time never gains a date, seconds or zone", async () => {
    const def = definition([field({ id: "clock", type: "time" })]);
    for (const ok of ["00:00", "09:05", "12:00", "23:59"]) expect(checkAnswers(def, { clock: ok }).answers.clock).toBe(ok);
    for (const bad of ["24:00", "12:60", "9:05", "12:00:00", "2024-01-01T12:00", "12:00Z", "12:00 PM"]) {
      expect(checkAnswers(def, { clock: bad }).errors.clock, bad).toBeTruthy();
    }
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, def);
    await submit(t, shareId, { clock: "00:00" });
    expect((await exportAll(owner, formId)).rows[0].cells.clock).toBe("00:00");
    const stored = (await exportAll(owner, formId)).rows[0].answers;
    expect(stored).toEqual({ clock: "00:00" });
  });
});

describe("numbers keep their precision and empty never becomes zero", () => {
  const def = definition([field({ id: "num", type: "number" }), field({ id: "req", type: "number", required: true })]);

  it("keeps decimals, negatives, zero and large values exactly", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, def);
    const values = [0.1 + 0.2, -5.5, 0, 1e-7, 123456789.123456789, Number.MAX_SAFE_INTEGER, -0.000001];
    for (const n of values) await submit(t, shareId, { num: n, req: 1 });
    const rows = (await exportAll(owner, formId)).rows;
    expect(rows.map((r) => r.answers.num)).toEqual(values);
    // -0 is stored as 0 by JSON-like storage; it must still read as zero, never as blank.
    expect(rows[2].cells.num).toBe("0");
  });

  it("leaves an unanswered optional number out, and does not store zero for it", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, def);
    for (const empty of [undefined, "", "   "]) {
      const answers: Record<string, string | number> = { req: 2 };
      if (empty !== undefined) answers.num = empty;
      const { responseId } = await submit(t, shareId, answers);
      const stored = await t.run((ctx) => ctx.db.get("formResponses", responseId));
      expect(stored!.answers).toEqual({ req: 2 });
      const detail = await owner.query(api.formResults.getResponse, { responseId });
      expect(detail!.items.find((i) => i.fieldId === "num")).toMatchObject({ state: "skipped", text: "" });
    }
    const rows = (await exportAll(owner, formId)).rows;
    expect(rows.every((r) => r.cells.num === "")).toBe(true);
    // Zero is an answer, distinct from blank.
    await submit(t, shareId, { num: 0, req: 0 });
    const last = (await exportAll(owner, formId)).rows.at(-1)!;
    expect(last.cells.num).toBe("0");
    expect(last.cells.req).toBe("0");
  });

  it("a required number rejects blank instead of storing zero", async () => {
    const t = createTestConvex();
    const { shareId } = await publish(t, def);
    await expect(submit(t, shareId, { num: 1 })).rejects.toThrow(/VALIDATION_FAILED/);
    await expect(submit(t, shareId, { req: "" })).rejects.toThrow(/VALIDATION_FAILED/);
  });
});

describe("skipped, unanswered and not applicable stay distinct", () => {
  it("tells the three states apart in the inbox and in exports", async () => {
    const t = createTestConvex();
    const def = definition([
      field({ id: "gate", type: "choice", required: true, options: [{ id: "y", label: "Yes" }, { id: "n", label: "No" }] }),
      field({ id: "shown", type: "text", showIf: { match: "all", conditions: [{ fieldId: "gate", op: "equals", value: "y" }] } }),
      field({ id: "hidden", type: "text", showIf: { match: "all", conditions: [{ fieldId: "gate", op: "equals", value: "n" }] } }),
    ]);
    const { owner, shareId } = await publish(t, def);
    const { responseId } = await submit(t, shareId, { gate: "y", hidden: "smuggled through a hidden field" });
    const detail = await owner.query(api.formResults.getResponse, { responseId });
    const state = (id: string) => detail!.items.find((i) => i.fieldId === id)!.state;
    expect(state("gate")).toBe("answered");
    expect(state("shown")).toBe("skipped"); // visible, left blank
    expect(state("hidden")).toBe("not_applicable"); // never shown
    // The hidden answer is dropped, not stored.
    const stored = await t.run((ctx) => ctx.db.get("formResponses", responseId));
    expect(stored!.answers).toEqual({ gate: "y" });
  });
});

// ── CSV and XLSX ────────────────────────────────────────────────────────────

describe("CSV export", () => {
  const GUARDED = /^[\s]*[=+\-@\t\r]/;

  it("round-trips delimiters, quotes, newlines, Arabic and emoji through a CSV reader", () => {
    const values = [...HOSTILE_LABELS.filter((v) => !GUARDED.test(v)), "", "plain", "a,b,c", '""', ",", "\n", "ثلاثة\nأسطر\nهنا", "😀,\"😀\""];
    const csv = "﻿" + [values].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const parsed = parseCsv(csv.slice(1));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual(values);
  });

  it("keeps a multi-row table aligned when cells contain commas and line breaks", () => {
    const table = [["h1", "h2"], ["a,b", "c\nd"], ['e"f', "مرحبا"]];
    const csv = table.map((row) => row.map(csvCell).join(",")).join("\r\n");
    expect(parseCsv(csv)).toEqual(table);
  });

  it("guards a cell that starts with a carriage return", () => {
    expect(csvCell("\r\nx")).toBe('"\'\r\nx"');
  });

  it("neutralises formula injection in strings", () => {
    for (const evil of ["=1+1", "+1+1", "-1+1", "@SUM(A1)", "\t=1", "\r=1", "  =1+1", '=HYPERLINK("http://x","y")', "-cmd|' /C calc'!A0"]) {
      const cell = csvCell(evil);
      expect(cell.startsWith(`"'`), evil).toBe(true);
      // The original text is still there after the guard.
      expect(cell.slice(2, -1).replace(/""/g, '"')).toBe(evil);
    }
  });

  it("does not alter plain numbers, including negative and signed ones (#210)", () => {
    for (const n of ["-5", "-0.5", "+3", "-1.5e3", "0", "1234.56", "-123456789.123"]) expect(csvCell(n), n).toBe(`"${n}"`);
    expect(csvCell(-5)).toBe('"-5"');
    // Still guarded: something that only starts like a number.
    expect(csvCell("-5+cmd")).toBe(`"'-5+cmd"`);
    expect(csvCell("+966 50 123 4567")).toBe(`"'+966 50 123 4567"`);
  });

  it("writes null and undefined as blank and objects as JSON", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell({ a: "b, c" })).toBe('"{""a"":""b, c""}"');
  });

  it("exports a negative number answer from a real form without a leading apostrophe", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, definition([field({ id: "temp", type: "number" })]));
    await submit(t, shareId, { temp: -12.5 });
    const cell = (await exportAll(owner, formId)).rows[0].cells.temp;
    expect(csvCell(cell)).toBe('"-12.5"');
  });

  it("uses one decimal representation whatever the server locale", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, definition([field({ id: "n", type: "number" })]));
    await submit(t, shareId, { n: 1234567.891 });
    expect((await exportAll(owner, formId)).rows[0].cells.n).toBe("1234567.891"); // no grouping, always a dot
  });
});

describe("XLSX export", () => {
  it("keeps Arabic, emoji, delimiters and newlines, escapes markup, and never evaluates formulas", () => {
    const cells = ["مرحبا بالعالم", "😀 👨‍👩‍👧", "a,b;c", "line1\nline2", "<b>&amp;</b>", "=1+1", '"quoted"', "  padded  "];
    const bytes = buildXlsx([cells]);
    expect(xlsxStrings(bytes)).toEqual(cells);
    const xml = sheetXml(bytes);
    // Every text cell is an inline string, so "=1+1" is text, not a formula element.
    expect(xml).not.toContain("<f>");
    expect(xml).toContain('t="inlineStr"');
  });

  it("writes numbers as numbers and blanks as absent cells", () => {
    const xml = sheetXml(buildXlsx([[0.1 + 0.2, -5.5, "", null, undefined, true]]));
    expect(xml).toContain("<v>0.30000000000000004</v>");
    expect(xml).toContain("<v>-5.5</v>");
    expect(xml).toContain('t="b"><v>1</v>');
    expect((xml.match(/<c /g) ?? []).length).toBe(3);
  });

  it("documents the characters it cannot carry: XML-illegal control characters are dropped", () => {
    const [text] = xlsxStrings(buildXlsx([["a\u0000b\u0008c\u000bd\u001fe"]]));
    expect(text).toBe("abcde");
  });

  it("truncates only past Excel's 32,767 character cell limit", () => {
    const long = "س".repeat(32_767);
    expect(xlsxStrings(buildXlsx([[long]]))[0]).toHaveLength(32_767);
    expect(xlsxStrings(buildXlsx([[long + "x"]]))[0]).toHaveLength(32_767);
  });

  it("carries a real form export through unchanged", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, allTypesDefinition());
    await submit(t, shareId, awkward);
    const { columns, rows } = await exportAll(owner, formId);
    const header = columns.map((c) => c.label);
    const line = columns.map((c) => rows[0].cells[c.key] ?? "");
    const strings = xlsxStrings(buildXlsx([header, line]));
    for (const value of [...header, ...line].filter(Boolean)) expect(strings).toContain(value);
  });
});

// ── Concurrency ─────────────────────────────────────────────────────────────
// convex-test runs mutations one after another, so these prove the logic's outcome
// (one winner, exact counts), not Convex's optimistic-concurrency retry itself.

describe("concurrent submissions", () => {
  const simple = () => definition([field({ id: "a", type: "text", required: true })]);

  it("two submissions with the same key record one response", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, simple());
    const key = nextKey();
    const [one, two] = await Promise.all([submit(t, shareId, { a: "first" }, key), submit(t, shareId, { a: "second" }, key)]);
    expect(one.responseId).toBe(two.responseId);
    expect([one.duplicate, two.duplicate].sort()).toEqual([false, true]);
    expect((await owner.query(api.forms.getFormForEditor, { formId }))!.responseCount).toBe(1);
    expect(await t.run((ctx) => ctx.db.query("formResponses").collect())).toHaveLength(1);
  });

  it("replaying a key with different answers returns the original and does not overwrite it", async () => {
    const t = createTestConvex();
    const { shareId } = await publish(t, simple());
    const key = nextKey();
    const first = await submit(t, shareId, { a: "original" }, key);
    const replay = await submit(t, shareId, { a: "tampered" }, key);
    expect(replay).toMatchObject({ duplicate: true, responseId: first.responseId, receiptCode: first.receiptCode });
    expect((await t.run((ctx) => ctx.db.get("formResponses", first.responseId)))!.answers).toEqual({ a: "original" });
  });

  it("replay still works after the form closes or is full", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, simple(), { responseLimit: 1 });
    const key = nextKey();
    const first = await submit(t, shareId, { a: "x" }, key);
    await owner.mutation(api.forms.setFormStatus, { formId, status: "closed" });
    const replay = await submit(t, shareId, { a: "x" }, key);
    expect(replay).toMatchObject({ duplicate: true, responseId: first.responseId });
  });

  it("many parallel submissions with distinct keys are all kept and counted once each", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, simple());
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => submit(t, shareId, { a: `person ${i}` })));
    expect(new Set(results.map((r) => r.responseId)).size).toBe(10);
    expect(new Set(results.map((r) => r.receiptCode)).size).toBe(10);
    expect((await owner.query(api.forms.getFormForEditor, { formId }))!.responseCount).toBe(10);
    const agg = await t.run((ctx) => ctx.db.query("formAggregates").withIndex("by_formId", (q) => q.eq("formId", formId)).unique());
    expect(agg!.counts.a.answered).toBe(10);
  });

  it("racing for the last place lets exactly one through and never exceeds the limit", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, simple(), { responseLimit: 2 });
    await submit(t, shareId, { a: "seed" });
    const settled = await Promise.allSettled([submit(t, shareId, { a: "racer 1" }), submit(t, shareId, { a: "racer 2" }), submit(t, shareId, { a: "racer 3" })]);
    expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(1);
    for (const s of settled.filter((x) => x.status === "rejected")) expect((s as PromiseRejectedResult).reason.message).toMatch(/FORM_FULL/);
    expect((await owner.query(api.forms.getFormForEditor, { formId }))!.responseCount).toBe(2);
    expect(await t.run((ctx) => ctx.db.query("formResponses").collect())).toHaveLength(2);
  });

  it("a partial save and its final submission become one response", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId } = await publish(t, simple(), { collectPartial: true });
    const key = nextKey();
    const partial = await t.mutation(api.respond.submitResponse, { shareId, submissionKey: key, answers: {}, language: "en", final: false });
    const final = await submit(t, shareId, { a: "done" }, key);
    expect(final.responseId).toBe(partial.responseId);
    const form = (await owner.query(api.forms.getFormForEditor, { formId }))!;
    expect(form).toMatchObject({ responseCount: 1, partialCount: 0 });
  });
});

// ── Editing a published form ────────────────────────────────────────────────

describe("editing and deleting questions after responses exist", () => {
  async function twoVersions(t: T) {
    const v1 = definition([
      field({ id: "keep", type: "text", label: "Name", required: true }),
      field({ id: "gone", type: "text", label: "Favourite colour" }),
      field({ id: "pick", type: "choice", label: "Size", options: [{ id: "s", label: "Small" }, { id: "l", label: "Large" }] }),
    ]);
    const ctx = await publish(t, v1, { collectPartial: true });
    const first = await submit(t, ctx.shareId, { keep: "Amal", gone: "أزرق", pick: "l" });
    const partialKey = nextKey();
    const partial = await t.mutation(api.respond.submitResponse, { shareId: ctx.shareId, submissionKey: partialKey, answers: { keep: "Bilal" }, language: "en", final: false });

    const editor = (await ctx.owner.query(api.forms.getFormForEditor, { formId: ctx.formId }))!;
    const v2 = {
      ...editor.draft,
      fields: [
        field({ id: "keep", type: "text", label: "Full name", required: true }),
        field({ id: "pick", type: "choice", label: "Size", options: [{ id: "s", label: "Small (renamed)" }, { id: "l", label: "Large (renamed)" }] }),
        field({ id: "added", type: "text", label: "New required question", required: true }),
      ],
    };
    const saved = await ctx.owner.mutation(api.forms.saveFormDraft, { formId: ctx.formId, expectedRevision: editor.draftRevision, definition: v2 });
    return { ...ctx, first, partial, partialKey, saved };
  }

  it("unpublished edits do not change what respondents see or what is stored", async () => {
    const t = createTestConvex();
    const { shareId, formId, owner, saved } = await twoVersions(t);
    const pub = await t.query(api.respond.getPublicForm, { shareId });
    if (pub.state !== "open") throw new Error("expected open");
    expect(pub.version).toBe(1);
    expect(pub.definition.fields.map((f) => f.id)).toEqual(["keep", "gone", "pick"]);
    const form = (await owner.query(api.forms.getFormForEditor, { formId }))!;
    expect(form.hasUnpublishedChanges).toBe(true);
    expect(saved.draftRevision).toBeGreaterThan(1);
  });

  it("existing responses stay bound to the version they were answered on", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId, first, saved } = await twoVersions(t);
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
    const stored = await t.run((ctx) => ctx.db.get("formResponses", first.responseId));
    expect(stored!.version).toBe(1);
    expect(stored!.answers).toEqual({ keep: "Amal", gone: "أزرق", pick: "l" });

    // The old response is still shown with the labels and options of version 1, including the removed question.
    const detail = await owner.query(api.formResults.getResponse, { responseId: first.responseId });
    expect(detail!.version).toBe(1);
    expect(detail!.items.map((i) => [i.label, i.text])).toEqual([["Name", "Amal"], ["Favourite colour", "أزرق"], ["Size", "Large"]]);

    // New submissions use version 2 and its new required question.
    await expect(submit(t, shareId, { keep: "Cara", pick: "s" })).rejects.toThrow(/VALIDATION_FAILED/);
    const second = await submit(t, shareId, { keep: "Cara", pick: "s", added: "yes" });
    expect((await t.run((ctx) => ctx.db.get("formResponses", second.responseId)))!.version).toBe(2);
  });

  it("an unfinished submission started on version 1 is finished against version 1", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId, partial, partialKey, saved } = await twoVersions(t);
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
    // The respondent never saw "added"; finishing must not demand it, and the answers stay on version 1.
    const done = await submit(t, shareId, { keep: "Bilal", gone: "green", pick: "s" }, partialKey);
    expect(done.responseId).toBe(partial.responseId);
    const stored = await t.run((ctx) => ctx.db.get("formResponses", done.responseId));
    expect(stored).toMatchObject({ version: 1, status: "completed", answers: { keep: "Bilal", gone: "green", pick: "s" } });
  });

  it("the spreadsheet export keeps the answers to a question that was removed later", async () => {
    const t = createTestConvex();
    const { owner, formId, shareId, saved } = await twoVersions(t);
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
    await submit(t, shareId, { keep: "Cara", pick: "s", added: "yes" });
    const { columns, rows } = await exportAll(owner, formId);
    const labelOf = (key: string) => columns.find((c) => c.key === key)?.label;
    // Every value in every row has a column, so nothing is dropped from CSV/XLSX.
    for (const row of rows) for (const [key, value] of Object.entries(row.cells)) if (value) expect(labelOf(key), key).toBeTruthy();
    const old = rows.find((r) => r.cells.gone === "أزرق")!;
    expect(old.version).toBe(1);
    // Column keys are the same on every page of an export, so a multi-page export lines up.
    const page1 = await owner.query(api.formResults.exportResponses, { formId, includePartial: true, includeSpam: true, paginationOpts: { numItems: 1, cursor: null } });
    expect(page1!.columns).toEqual(columns);
  });

  it("the inbox preview and analysis keep working after the change", async () => {
    const t = createTestConvex();
    const { owner, formId, saved } = await twoVersions(t);
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
    const inbox = await owner.query(api.formResults.listResponses, { formId, filter: {}, paginationOpts: { numItems: 10, cursor: null } });
    expect(inbox.page.some((r) => r.preview.includes("أزرق"))).toBe(true);
    expect(await owner.query(api.formResults.getAnalysis, { formId })).not.toBeNull();
  });

  it("a stale save is refused rather than merged over newer work", async () => {
    const t = createTestConvex();
    const { owner, formId } = await twoVersions(t);
    await expect(owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: 1, definition: definition([]) })).rejects.toThrow(/DRAFT_CONFLICT/);
  });
});

// ── Quiz scoring ────────────────────────────────────────────────────────────

describe("quiz scoring never exceeds the maximum", () => {
  /** Deterministic pseudo-random numbers so a failure can be replayed. */
  function rng(seed: number) {
    return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  }

  function randomQuiz(rand: () => number): FormDefinition {
    const count = 1 + Math.floor(rand() * 8);
    const fields: FormField[] = [];
    for (let i = 0; i < count; i++) {
      const many = rand() < 0.4;
      const optionCount = 2 + Math.floor(rand() * 4);
      const options = Array.from({ length: optionCount }, (_, j) => ({ id: `o${j}`, label: `Option ${j}, with comma` }));
      const correct = many ? options.filter(() => rand() < 0.5).map((o) => o.id) : [options[Math.floor(rand() * optionCount)].id];
      fields.push(field({
        id: `q${i}`, type: many ? "multi_choice" : "choice", options,
        quiz: { correctOptionIds: correct.length ? correct : [options[0].id], points: Math.floor(rand() * 20) / 2 },
      }));
    }
    return { ...definition(fields), quiz: { enabled: true } };
  }

  function randomAnswers(def: FormDefinition, rand: () => number) {
    const answers: Record<string, string | string[]> = {};
    for (const f of def.fields) {
      if (rand() < 0.15) continue;
      const ids = (f.options ?? []).map((o) => o.id);
      answers[f.id] = f.type === "multi_choice" ? ids.filter(() => rand() < 0.5) : ids[Math.floor(rand() * ids.length)];
    }
    return answers;
  }

  it("holds for 500 random quizzes and answer sets", () => {
    const rand = rng(20260929);
    for (let n = 0; n < 500; n++) {
      const def = randomQuiz(rand);
      const grade = gradeQuiz(def, randomAnswers(def, rand))!;
      expect(grade.score, `case ${n}`).toBeGreaterThanOrEqual(0);
      expect(grade.score, `case ${n}`).toBeLessThanOrEqual(grade.maxScore);
      expect(grade.questions.every((q) => q.earned >= 0 && q.earned <= q.possible)).toBe(true);
      expect(grade.questions.reduce((s, q) => s + q.earned, 0)).toBe(grade.score);
      // Answering every question correctly gives exactly the maximum.
      const perfect: Record<string, string | string[]> = {};
      for (const f of def.fields) perfect[f.id] = f.type === "multi_choice" ? f.quiz!.correctOptionIds : f.quiz!.correctOptionIds[0];
      expect(gradeQuiz(def, perfect)!.score).toBe(grade.maxScore);
    }
  });

  it("a hidden question is neither scored nor counted in the maximum", () => {
    const def: FormDefinition = {
      ...definition([
        field({ id: "gate", type: "choice", options: [{ id: "y", label: "Y" }, { id: "n", label: "N" }], quiz: { correctOptionIds: ["y"], points: 2 } }),
        field({ id: "extra", type: "choice", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], quiz: { correctOptionIds: ["a"], points: 5 },
          showIf: { match: "all", conditions: [{ fieldId: "gate", op: "equals", value: "y" }] } }),
      ]),
      quiz: { enabled: true },
    };
    expect(gradeQuiz(def, { gate: "n", extra: "a" })).toMatchObject({ score: 0, maxScore: 2 });
    expect(gradeQuiz(def, { gate: "y", extra: "a" })).toMatchObject({ score: 7, maxScore: 7 });
  });

  it("publication rejects points that would break the bound", () => {
    for (const points of [-1, NaN, Infinity, 1001]) {
      const def: FormDefinition = { ...definition([field({ id: "q", type: "choice", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], quiz: { correctOptionIds: ["a"], points } })]), quiz: { enabled: true } };
      expect(checkDefinition(def).errors.some((e) => /points/.test(e)), String(points)).toBe(true);
    }
  });

  it("a multi-choice answer needs the exact set: extra or missing options earn nothing", () => {
    const def: FormDefinition = {
      ...definition([field({ id: "m", type: "multi_choice", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }], quiz: { correctOptionIds: ["a", "b"], points: 3 } })]),
      quiz: { enabled: true },
    };
    expect(gradeQuiz(def, { m: ["a", "b"] })!.score).toBe(3);
    expect(gradeQuiz(def, { m: ["b", "a"] })!.score).toBe(3);
    expect(gradeQuiz(def, { m: ["a"] })!.score).toBe(0);
    expect(gradeQuiz(def, { m: ["a", "b", "c"] })!.score).toBe(0);
  });

  it("stores the same score the respondent was shown and ignores tampered client scores", async () => {
    const t = createTestConvex();
    const def: FormDefinition = {
      ...definition([
        field({ id: "q1", type: "choice", options: [{ id: "r", label: "Right" }, { id: "w", label: "Wrong" }], quiz: { correctOptionIds: ["r"], points: 2.5 } }),
        field({ id: "q2", type: "multi_choice", options: [{ id: "a", label: "A, one" }, { id: "b", label: "B" }], quiz: { correctOptionIds: ["a"], points: 1.5 } }),
      ]),
      quiz: { enabled: true },
    };
    const { owner, shareId } = await publish(t, def);
    const res = await submit(t, shareId, { q1: "r", q2: ["a"] });
    expect(res).toMatchObject({ quizScore: 4, quizMaxScore: 4 });
    const partly = await submit(t, shareId, { q1: "r", q2: ["b"] });
    expect(partly).toMatchObject({ quizScore: 2.5, quizMaxScore: 4 });
    const detail = await owner.query(api.formResults.getResponse, { responseId: partly.responseId });
    expect(detail).toMatchObject({ quizScore: 2.5, quizMaxScore: 4 });
    const results = await owner.query(api.formResults.listResponses, { formId: detail!.formId, filter: {}, paginationOpts: { numItems: 10, cursor: null } });
    for (const r of results.page) expect(r.quizScore!).toBeLessThanOrEqual(r.quizMaxScore!);
  });
});
