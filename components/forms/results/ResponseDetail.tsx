"use client";

import { toast } from "@/lib/toast";
import { useEffect } from "react";
import { useMutation } from "convex/react";
import { Check, ChevronDown, ChevronUp, CircleCheck, Circle, Printer, Tag, Trash2, X } from "lucide-react";
import { useQuery } from "@/lib/convexCache";
import { setReviewedLocally, useOptimisticMutation } from "@/lib/optimistic";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WsMenu } from "@/components/workspace/primitives";
import { formatDateTime, useCopy, useLocale } from "@/lib/i18n";
import { formatDuration, resultsCopy } from "./copy";

/** Print just this response: everything else is hidden by the .ws-printing rules in workspace.css. */
function printResponse() {
  const root = document.documentElement;
  root.classList.add("ws-printing");
  const done = () => { root.classList.remove("ws-printing"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
  // Browsers without afterprint (or with a blocking print dialog) are done once print() returns.
  setTimeout(done, 1000);
}

export function ResponseDetail({ responseId, formId, tags, position, onPrevious, onNext, onClose, onDelete, onNewTag, inSheet }: {
  responseId: Id<"formResponses">;
  formId: Id<"forms">;
  tags: string[];
  position: { index: number; total: number } | null;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onDelete?: () => void;
  onNewTag: () => void;
  /** Shown inside a sheet that has its own title and close button. */
  inSheet?: boolean;
}) {
  const t = useCopy(resultsCopy);
  const { locale } = useLocale();
  const r = useQuery(api.formResults.getResponse, { responseId });
  const setReviewed = useOptimisticMutation(api.formResults.setReviewed, setReviewedLocally);
  const setTags = useMutation(api.formResults.setTags);
  const when = (ms: number) => formatDateTime(locale, ms, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // Reviewing stays a deliberate action; opening a response does not mark it.
  // Keys while reading: [ and ] (or p / n) step through responses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true'], [role='menu'], [role='listbox']") || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === "[" || e.key === "p") && onPrevious) { e.preventDefault(); onPrevious(); }
      if ((e.key === "]" || e.key === "n") && onNext) { e.preventDefault(); onNext(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onPrevious, onNext]);

  if (r === undefined) {
    return (
      <output  aria-busy="true" className="ws-detail">
        <span className="sr-only">{t.loadingResponse}</span>
        <span aria-hidden="true" className="ws-skeleton" style={{ height: 320 }} />
      </output>
    );
  }
  if (r === null) {
    return (
      <div className="ws-detail">
        <p className="ws-muted">{t.deleted}</p>
        {!inSheet && <button type="button" className="ws-btn ws-btn--sm mt-3" onClick={onClose}>{t.close}</button>}
      </div>
    );
  }
  const metaRows: [string, string][] = [
    [t.time, formatDuration(r.durationMs, locale)],
    [t.language, r.language === "ar" ? t.arabic : t.english],
    [t.receipt, r.receiptCode],
    [t.versionLabel, String(r.version)],
    ...(r.respondent ? [[t.respondent, r.respondent] as [string, string]] : []),
    ...(r.ending ? [[t.ending, r.ending] as [string, string]] : []),
    // Hidden fields from the link, e.g. source = instagram.
    ...Object.entries(r.hidden ?? {}).map(([k, v]) => [k, v] as [string, string]),
  ];

  return (
    <article className="ws-detail" data-print-root aria-labelledby={`detail-${r._id}`}>
      <div className="ws-detail__bar" data-print-hide>
        <div className="flex items-center gap-0.5">
          <button type="button" className="ws-icon-button" aria-label={t.previous} aria-keyshortcuts="[" disabled={!onPrevious} onClick={onPrevious}><ChevronUp size={18} /></button>
          <button type="button" className="ws-icon-button" aria-label={t.next} aria-keyshortcuts="]" disabled={!onNext} onClick={onNext}><ChevronDown size={18} /></button>
          {position && <span className="ws-detail__pos">{t.position(position.index + 1, position.total)}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          {r.canEdit && (
            <button type="button" className={`ws-btn ws-btn--ghost ws-btn--sm ${r.reviewed ? "ws-detail__reviewed" : ""}`} aria-pressed={r.reviewed}
              onClick={() => setReviewed({ formId, responseIds: [r._id], reviewed: !r.reviewed })}>
              {r.reviewed ? <CircleCheck size={15} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />} {t.reviewedYes}
            </button>
          )}
          {r.canEdit && (
            <WsMenu label={t.tag} trigger={<Tag size={17} />}>
              {(close) => (
                <>
                  {tags.map((tag) => {
                    const on = r.tags.includes(tag);
                    return (
                      <button key={tag} type="button" role="menuitemcheckbox" aria-checked={on}
                        onClick={() => { setTags({ formId, responseIds: [r._id], ...(on ? { remove: tag } : { add: tag }) }).catch((error) => toast.error(error)); }}>
                        <span className="flex-1 truncate">{tag}</span>{on && <Check size={15} aria-hidden="true" />}
                      </button>
                    );
                  })}
                  {tags.length > 0 && <hr />}
                  <button type="button" role="menuitem" onClick={() => { close(); onNewTag(); }}>{t.newTag}…</button>
                </>
              )}
            </WsMenu>
          )}
          <button type="button" className="ws-icon-button" aria-label={t.print} onClick={printResponse}><Printer size={17} /></button>
          {onDelete && r.canDelete && <button type="button" className="ws-icon-button ws-icon-button--danger" aria-label={t.delete} onClick={onDelete}><Trash2 size={17} /></button>}
          {!inSheet && <button type="button" className="ws-icon-button" aria-label={t.close} onClick={onClose}><X size={17} /></button>}
        </div>
      </div>

      <header className="ws-detail__head">
        <h2 id={`detail-${r._id}`} className="ws-detail__title">{r.status === "partial" ? t.unfinishedResponse : t.responseLabel} · {when(r.submittedAt)}</h2>
        <dl className="ws-detail__meta">
          {metaRows.map(([k, v], i) => <div key={`${i}-${k}`}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        {(r.tags.length > 0 || r.quizScore !== null) && (
          <div className="flex flex-wrap gap-1.5">
            {r.quizScore !== null && <span className="ws-pill ws-pill--green">{t.quizScore}: {r.quizScore} / {r.quizMaxScore ?? 0}</span>}
            {r.tags.map((tag) => (
              <span key={tag} className="ws-pill ws-tag">
                {tag}
                {r.canEdit && <button type="button" data-print-hide aria-label={t.removeTag(tag)} onClick={() => setTags({ formId, responseIds: [r._id], remove: tag }).catch((error) => toast.error(error))}><X size={12} /></button>}
              </span>
            ))}
          </div>
        )}
        {r.editCount > 0 && r.editedAt !== null && <p className="ws-detail__note">{t.editedNote(r.editCount, when(r.editedAt))}</p>}
        {r.spam && <p className="ws-detail__note ws-detail__note--warn">{t.spamNote}</p>}
      </header>

      <dl className="ws-answers">
        {r.items.map((item) => (
          <div key={item.fieldId} className="ws-answer" data-state={item.state}>
            <dt>
              {item.label}
              {item.scale && (item.scale.minLabel || item.scale.maxLabel) && (
                <span className="ws-answer__hint"> ({[item.scale.minLabel ? `${item.scale.min} = ${item.scale.minLabel}` : "", item.scale.maxLabel ? `${item.scale.max} = ${item.scale.maxLabel}` : ""].filter(Boolean).join("; ")})</span>
              )}
            </dt>
            <dd>
              {item.state === "not_applicable" ? <em>{t.notShownAnswer}</em>
                : item.state === "skipped" ? <em>{t.skippedAnswer}</em>
                : item.files.length ? (
                  <ul className="grid gap-1">
                    {item.files.map((f) => (
                      <li key={f._id}>{f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{f.name}</a> : f.name} <span className="ws-muted text-[12px]">({Math.ceil(f.size / 1024)} {t.kb})</span></li>
                    ))}
                  </ul>
                ) : item.text}
            </dd>
          </div>
        ))}
      </dl>

      {r.revisions.length > 0 && (
        <details className="ws-disclosure" data-testid="edit-history">
          <summary><ChevronDown size={15} aria-hidden="true" /> {t.earlier(r.revisions.length)}</summary>
          <p className="ws-muted text-[13px] mb-3">{t.earlierNote}</p>
          <ol className="grid gap-3 pb-2">
            {[...r.revisions].reverse().map((rev) => (
              <li key={rev.revision} className="ws-revision">
                <p className="ws-muted text-[12.5px]">{rev.revision === 1 ? t.original : t.versionN(rev.revision)} · {t.savedReplaced(when(rev.savedAt), when(rev.replacedAt))}</p>
                <dl className="grid gap-2 mt-2">
                  {rev.items.filter((item) => item.text).map((item) => (
                    <div key={item.fieldId}>
                      <dt className="ws-muted text-[12.5px]">{item.label}</dt>
                      <dd className="text-[14px] whitespace-pre-line break-words">{item.text}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
