"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, Download } from "lucide-react";
import MagneticFileDropZone from "@/components/workspace/MagneticFileDropZone";
import { Select } from "@/components/workspace/Select";
import { guessSheetRoles, sheetDefinition, sheetQuestions, sheetRoles, SHEET_TEMPLATE } from "@/lib/formImporters";
import type { ImportResult, SheetRole } from "@/lib/formImporters";
import { buildXlsx, downloadBlob, parseCsv, readXlsx } from "@/lib/xlsx";
import { csvCell } from "@/convex/formLogic";
import { errorMessage } from "@/lib/errors";
import { useCopy } from "@/lib/i18n";
import DocHint from "./DocHint";

const copy = {
  en: {
    intro: "Upload a CSV or Excel file with one question per row. Check the columns, fix or skip rows with problems, then create a draft to review.",
    choose: "Choose CSV or Excel file", template: "Template", templateCsv: "CSV template", templateXlsx: "Excel template",
    tooBig: "Files can be at most 5 MB.", unreadable: "This file could not be read. Save it as .csv or .xlsx and try again.", empty: "No rows found in this file.",
    headerRow: "First row has column names", columns: "Columns", column: (n: number, name: string) => `Column ${n}${name ? `: ${name}` : ""}`,
    roles: { ignore: "Ignore", question: "Question", type: "Type", options: "Options (separated by |)", option: "One option", correct: "Correct answer", points: "Points", explanation: "Explanation", required: "Required", description: "Description" } as Record<SheetRole, string>,
    needQuestion: "Choose which column holds the question.",
    rows: "Rows", line: (n: number) => `Row ${n}`, include: (n: number) => `Import row ${n}`, fix: "Fix", done: "Done", skip: "Skip", unskip: "Include",
    summary: (ok: number, bad: number, skipped: number) => `${ok} ready${bad ? ` · ${bad} with problems (not imported until fixed)` : ""}${skipped ? ` · ${skipped} skipped` : ""}`,
    title: "Draft title", create: (n: number) => `Create draft with ${n} question${n === 1 ? "" : "s"}`, quizNote: "Rows with a correct answer make this a quiz.",
  },
  ar: {
    intro: "ارفع ملف CSV أو Excel فيه سؤال في كل صف. راجع الأعمدة، وأصلح الصفوف التي بها مشكلات أو تخطَّها، ثم أنشئ مسودة لمراجعتها.",
    choose: "اختر ملف CSV أو Excel", template: "القالب", templateCsv: "قالب CSV", templateXlsx: "قالب Excel",
    tooBig: "الحد الأقصى لحجم الملف 5 ميغابايت.", unreadable: "تعذّرت قراءة الملف. احفظه بصيغة ‎.csv أو ‎.xlsx وحاول مجددًا.", empty: "لا توجد صفوف في هذا الملف.",
    headerRow: "الصف الأول يحتوي أسماء الأعمدة", columns: "الأعمدة", column: (n: number, name: string) => `العمود ${n}${name ? `: ${name}` : ""}`,
    roles: { ignore: "تجاهل", question: "السؤال", type: "النوع", options: "الخيارات (يفصلها |)", option: "خيار واحد", correct: "الإجابة الصحيحة", points: "النقاط", explanation: "الشرح", required: "إلزامي", description: "الوصف" } as Record<SheetRole, string>,
    needQuestion: "اختر العمود الذي يحتوي السؤال.",
    rows: "الصفوف", line: (n: number) => `الصف ${n}`, include: (n: number) => `استورد الصف ${n}`, fix: "أصلح", done: "تم", skip: "تخطَّ", unskip: "ضمّن",
    summary: (ok: number, bad: number, skipped: number) => `${ok} جاهز${bad ? ` · ${bad} بها مشكلات (لن تُستورد حتى تُصلح)` : ""}${skipped ? ` · ${skipped} متخطّى` : ""}`,
    title: "عنوان المسودة", create: (n: number) => `أنشئ مسودة من ${n} سؤال`, quizNote: "الصفوف التي فيها إجابة صحيحة تجعل هذا اختبارًا.",
  },
};

/** CSV / XLSX question import: upload, map columns, fix or skip rows, then hand a draft definition back. */
export default function SheetImport({ busy, onImport }: { busy: boolean; onImport: (result: ImportResult, label: string) => void }) {
  const t = useCopy(copy);
  const [fileName, setFileName] = useState("");
  const [grid, setGrid] = useState<string[][]>([]);
  const [roles, setRoles] = useState<SheetRole[]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const load = async (file: File) => {
    setError("");
    if (file.size > 5_000_000) { setError(t.tooBig); return; }
    try {
      const rows = /\.xlsx$/i.test(file.name) ? await readXlsx(await file.arrayBuffer()) : parseCsv(await file.text());
      if (!rows.some((r) => r.some((c) => c.trim()))) { setError(t.empty); return; }
      const guess = guessSheetRoles(rows[0] ?? []);
      const width = Math.min(50, Math.max(...rows.map((r) => r.length)));
      setGrid(rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")));
      setRoles(Array.from({ length: width }, (_, i) => guess.roles[i] ?? "ignore"));
      setHasHeader(guess.hasHeader);
      setSkipped(new Set());
      setEditing(null);
      setFileName(file.name);
      setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 200));
    } catch (err) {
      setError(errorMessage(err, t.unreadable));
    }
  };

  const rows = useMemo(() => (roles.includes("question") ? sheetQuestions(grid, roles, hasHeader) : []), [grid, roles, hasHeader]);
  const kept = rows.filter((r) => r.field && !skipped.has(r.line));
  const bad = rows.filter((r) => !r.field && !skipped.has(r.line)).length;
  const header = hasHeader ? grid[0] ?? [] : [];
  const mapped = roles.map((r, i) => ({ r, i })).filter((x) => x.r !== "ignore");

  const downloadTemplate = (kind: "csv" | "xlsx") => {
    if (kind === "xlsx") downloadBlob(buildXlsx(SHEET_TEMPLATE, "Questions"), "chaos-questions-template.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    else downloadBlob("﻿" + SHEET_TEMPLATE.map((r) => r.map(csvCell).join(",")).join("\r\n"), "chaos-questions-template.csv", "text/csv;charset=utf-8");
  };
  const setCell = (line: number, col: number, value: string) => setGrid((g) => g.map((row, i) => (i === line - 1 ? row.map((c, j) => (j === col ? value : c)) : row)));

  return (
    <section className="space-y-4" aria-label={t.choose}>
      <p className="text-[13px] text-muted-foreground">{t.intro}</p>
      <MagneticFileDropZone accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        maxBytes={5_000_000} disabled={busy} label={t.choose} selectedName={fileName}
        onReject={reason => setError(reason === "size" ? t.tooBig : t.unreadable)} onFile={load} />
      <div className="flex gap-2 flex-wrap items-center">
        <span className="ms-auto flex gap-1.5">
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => downloadTemplate("csv")}><Download size={14} aria-hidden="true" /> {t.templateCsv}</button>
          <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => downloadTemplate("xlsx")}><Download size={14} aria-hidden="true" /> {t.templateXlsx}</button>
        </span>
      </div>
      <DocHint slug="templates-and-import" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {grid.length > 0 && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-muted-foreground">{t.columns}</legend>
            <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> {t.headerRow}</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {roles.map((role, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate text-muted-foreground" title={header[i]}>{t.column(i + 1, header[i] ?? "")}</span>
                  <Select size="sm" label={t.column(i + 1, header[i] ?? "")} value={role}
                    onChange={(next) => setRoles((rs) => rs.map((r, j) => (j === i ? next : next !== "option" && next !== "ignore" && r === next ? "ignore" : r)))}
                    options={sheetRoles.map((r) => ({ value: r, label: t.roles[r] }))} />
                </div>
              ))}
            </div>
            {!roles.includes("question") && <p role="alert" className="text-xs text-destructive">{t.needQuestion}</p>}
          </fieldset>

          {rows.length > 0 && (
            <div className="space-y-2">
              <output className="text-xs font-semibold text-muted-foreground" >{t.rows} · {t.summary(kept.length, bad, skipped.size)}</output>
              <ol className="rounded-lg border divide-y max-h-72 overflow-y-auto text-sm">
                {rows.map((r) => {
                  const off = skipped.has(r.line);
                  return (
                    <li key={r.line} className={`p-2 space-y-1 ${off ? "opacity-50" : ""}`} data-testid="sheet-row">
                      <div className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1" aria-label={t.include(r.line)} checked={!off && !!r.field} disabled={!r.field && !off}
                          onChange={(e) => setSkipped((s) => { const n = new Set(s); if (e.target.checked) n.delete(r.line); else n.add(r.line); return n; })} />
                        <span className="text-xs text-muted-foreground tabular-nums w-14 shrink-0">{t.line(r.line)}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate">{r.field?.label || r.cells[roles.indexOf("question")] || "—"}</span>
                          {r.errors.map((m) => <span key={m} className="flex items-center gap-1 text-xs text-destructive"><AlertCircle size={12} aria-hidden="true" />{m}</span>)}
                          {!r.errors.length && r.warnings.map((m) => <span key={m} className="block text-xs text-muted-foreground">{m}</span>)}
                        </span>
                        {r.field ? <Check size={15} className="text-[var(--primary)] shrink-0" aria-hidden="true" /> : (
                          <span className="flex gap-1 shrink-0">
                            <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => setEditing(editing === r.line ? null : r.line)}>{editing === r.line ? t.done : t.fix}</button>
                            <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => setSkipped((s) => { const n = new Set(s); if (n.has(r.line)) n.delete(r.line); else n.add(r.line); return n; })}>{off ? t.unskip : t.skip}</button>
                          </span>
                        )}
                      </div>
                      {editing === r.line && (
                        <div className="grid gap-1.5 sm:grid-cols-2 ps-6">
                          {mapped.map(({ r: role, i }) => (
                            <label key={i} className="text-xs text-muted-foreground">{t.roles[role]}
                              <input className="kb-input text-sm mt-0.5" value={grid[r.line - 1]?.[i] ?? ""} onChange={(e) => setCell(r.line, i, e.target.value)} />
                            </label>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              <label className="block text-sm">{t.title}
                <input className="kb-input mt-1" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
              </label>
              {kept.some((r) => r.field?.quiz) && <p className="text-xs text-muted-foreground">{t.quizNote}</p>}
              <button type="button" className="ws-btn ws-btn--primary" disabled={busy || !kept.length}
                onClick={() => onImport(sheetDefinition(kept, title), fileName)}>
                {t.create(kept.length)}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
