"use client";

import { useState } from "react";
import { useConvex } from "convex/react";
import { Braces, Download, FileSpreadsheet, FileText } from "lucide-react";
import posthog from "@/lib/analytics";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { csvCell } from "@/convex/formLogic";
import { buildXlsx, downloadBlob, safeFilename } from "@/lib/xlsx";
import { errorMessage } from "@/lib/errors";
import { useCopy } from "@/lib/i18n";
import Link from "next/link";
import { WsSwitch } from "@/components/workspace/primitives";
import DocHint from "@/components/forms/DocHint";
import { resultsCopy } from "./copy";

/** Downloads every visible response. Column headers stay in English: they are a file format other tools read. */
export function ExportTab({ formId, title }: { formId: Id<"forms">; title: string }) {
  const t = useCopy(resultsCopy);
  const convex = useConvex();
  const [includePartial, setIncludePartial] = useState(false);
  const [includeSpam, setIncludeSpam] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const collect = async () => {
    const rows: NonNullable<Awaited<ReturnType<typeof fetchPage>>>["rows"] = [];
    let columns: { key: string; label: string }[] = [];
    const hiddenColumns = new Set<string>();
    let cursor: string | null = null;
    for (let guard = 0; guard < 1000; guard++) {
      const page = await fetchPage(cursor);
      if (!page) throw new Error(t.noAccess);
      columns = page.columns;
      for (const name of page.hiddenColumns ?? []) hiddenColumns.add(name);
      rows.push(...page.rows);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    return { columns, rows, hidden: [...hiddenColumns] };
  };
  const fetchPage = (cursor: string | null) =>
    convex.query(api.formResults.exportResponses, { formId, includePartial, includeSpam, paginationOpts: { numItems: 200, cursor } });

  const run = async (kind: "csv" | "xlsx" | "json") => {
    setBusy(kind);
    setError("");
    try {
      const { columns, rows, hidden } = await collect();
      const name = `${safeFilename(title)}-responses`;
      if (kind === "json") {
        const body = { format: "chaos-responses", formatVersion: 1, form: title, exportedAt: new Date().toISOString(), columns, hiddenFields: hidden, responses: rows };
        downloadBlob(JSON.stringify(body, null, 2), `${name}.json`, "application/json");
        posthog.capture("form_responses_exported", { format: kind, includes_partial: includePartial, includes_spam: includeSpam });
        return;
      }
      const header = ["Response ID", "Receipt", "Status", "Submitted", "Language", "Seconds", "Version", "Ending", "Quiz score", "Quiz max score", "Tags", "Reviewed", "Edited", "Last edited", ...(includeSpam ? ["Spam"] : []), ...columns.map((c) => c.label), ...hidden.map((h) => `Hidden: ${h}`)];
      const table = rows.map((r) => [
        r.id, r.receiptCode, r.status, new Date(r.submittedAt).toISOString(), r.language, r.durationSeconds ?? "", r.version, r.ending ?? "", r.quizScore ?? "", r.quizMaxScore ?? "", r.tags.join(", "), r.reviewed ? "yes" : "no", r.edited ? "yes" : "no", r.editedAt ? new Date(r.editedAt).toISOString() : "",
        ...(includeSpam ? [r.spam ? "yes" : "no"] : []), ...columns.map((c) => r.cells[c.key] ?? ""), ...hidden.map((h) => r.hidden?.[h] ?? ""),
      ]);
      if (kind === "xlsx") downloadBlob(buildXlsx([header, ...table]), `${name}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      else downloadBlob("﻿" + [header, ...table].map((row) => row.map(csvCell).join(",")).join("\r\n"), `${name}.csv`, "text/csv;charset=utf-8");
      posthog.capture("form_responses_exported", { format: kind, includes_partial: includePartial, includes_spam: includeSpam });
    } catch (err) {
      setError(errorMessage(err, t.exportFailed));
    } finally {
      setBusy(null);
    }
  };

  const formats = [
    { kind: "xlsx" as const, icon: FileSpreadsheet, name: t.xlsx, help: t.xlsxHelp },
    { kind: "csv" as const, icon: FileText, name: t.csv, help: t.csvHelp },
    { kind: "json" as const, icon: Braces, name: t.json, help: t.jsonHelp },
  ];
  return (
    <section className="ws-export" aria-labelledby="export-title">
      <div>
        <h2 id="export-title" className="ws-export__title">{t.exportTitle}</h2>
        <p className="ws-muted mt-1 max-w-2xl">{t.exportIntro}</p>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <WsSwitch checked={includePartial} onChange={setIncludePartial} label={t.includePartial} />
        <WsSwitch checked={includeSpam} onChange={setIncludeSpam} label={t.includeSpam} />
      </div>
      <ul className="ws-export__list">
        {formats.map(({ kind, icon: Icon, name, help }) => (
          <li key={kind} className="ws-export__item">
            <span className="ws-export__icon" aria-hidden="true"><Icon size={20} /></span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">{name}</h3>
              <p className="ws-muted text-[13.5px]">{help}</p>
            </div>
            <button type="button" className={`ws-btn ws-btn--sm ${kind === "xlsx" ? "ws-btn--primary" : ""}`} disabled={!!busy} onClick={() => run(kind)} aria-label={`${t.download} ${name}`}>
              <Download size={15} aria-hidden="true" /> {busy === kind ? t.preparing : t.download}
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DocHint slug="webhooks">{t.automate} <Link href="/dashboard/connections" className="underline underline-offset-2">{t.connections}</Link> ·</DocHint>
    </section>
  );
}
