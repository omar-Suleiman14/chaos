"use client";
/**
 * The version browser shared by quizzes, forms and games, lessons, courses and flashcards: the current
 * version (or draft) beside a stack of earlier ones, with a date timeline on the trailing edge. Older
 * versions deal in from the back; going back in time the front sheet flies past. Each kind supplies
 * how a version reads (`sheet`) and, when it can, how to restore one.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { formatDateTime, formatNumber, useCopy, useLocale } from "@/lib/i18n";
import { errorMessage } from "@/lib/errors";
import { useModal } from "@/components/workspace/useModal";
import "./versions.css";

export type VersionChange = "added" | "removed" | "changed" | "same";
export type ChangeCounts = { changed: number; added: number; removed: number };
/** One version as the browser lists it. `detail` follows the date in its caption. */
export type BrowsedVersion = { key: string; name: string; at: number; detail?: string };
/** How a sheet is drawn: compared with `against`, from the current side ("base") or the past side ("other"). */
export type SheetContext<V> = { against?: V; side: "base" | "other"; front: boolean };

const copy = {
  en: {
    history: "Version history", loading: "Loading versions…", unavailable: "Version history isn't available right now.",
    done: "Done", older: "Older version", newer: "Newer version", timeline: "Versions", now: "Now", showing: "Showing", showCurrent: "Current", showPast: "Earlier",
    onlyOne: "There's only one version so far. Each time you publish, the earlier version appears here.",
    changes: (c: string, a: string, r: string) => `${c} changed · ${a} added · ${r} removed`, noChanges: "No changes from the current version",
    cancel: "Cancel", restoring: "Restoring…", restored: "Restored to your draft.",
  },
  ar: {
    history: "سجل النسخ", loading: "جارٍ تحميل النسخ…", unavailable: "سجل النسخ غير متاح الآن.",
    done: "تم", older: "نسخة أقدم", newer: "نسخة أحدث", timeline: "النسخ", now: "الآن", showing: "عرض", showCurrent: "الحالية", showPast: "الأقدم",
    onlyOne: "توجد نسخة واحدة حتى الآن. كلما نشرت تظهر النسخة السابقة هنا.",
    changes: (c: string, a: string, r: string) => `${c} تغيّر · ${a} أُضيف · ${r} أُزيل`, noChanges: "لا تغييرات عن النسخة الحالية",
    cancel: "إلغاء", restoring: "جارٍ الاستعادة…", restored: "استُعيدت إلى مسودتك.",
  },
};

export type RestoreAction<V> = {
  /** Button label, e.g. "Restore to draft" or "Copy into draft". */
  label: string;
  /** Shown before the second, confirming click. */
  warning: string;
  run: (version: V) => Promise<unknown> | unknown;
  disabled?: boolean;
  /** The current side is itself a version (not a draft) and can be restored when it is the one shown. */
  current?: boolean;
};

export default function VersionBrowser<V extends BrowsedVersion>({ label, status, current, currentLabel, past, sheet, counts, footnote, onlyOne, restore, initialKey, onClose }: {
  label?: string;
  status: "loading" | "unavailable" | "ready";
  /** The version every earlier one is compared with: the live version or the draft. */
  current?: V;
  currentLabel: string;
  /** Earlier versions, newest first. */
  past: V[];
  sheet: (version: V, context: SheetContext<V>) => ReactNode;
  counts?: (current: V, other: V) => ChangeCounts;
  footnote?: string;
  onlyOne?: string;
  restore?: RestoreAction<V>;
  /** Open on this earlier version instead of the newest one. */
  initialKey?: string;
  onClose: () => void;
}) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(locale, n);
  const dialog = useModal<HTMLDivElement>({ onClose });
  const [selected, setSelected] = useState(() => Math.max(0, past.findIndex((v) => v.key === initialKey)));
  const [phoneView, setPhoneView] = useState<"past" | "current">("past");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const chosen = past[Math.min(selected, Math.max(0, past.length - 1))];
  // What Restore acts on: the earlier version in front, or the current one when it is a version and stands alone or is the one shown on a phone.
  const target = restore?.current && (!chosen || phoneView === "current") ? current : chosen;
  const pick = (i: number) => { if (i >= 0 && i < past.length) { setSelected(i); setPhoneView("past"); setConfirming(false); setError(""); setDone(false); } };
  const when = (v: V) => formatDateTime(locale, v.at, { dateStyle: "medium", timeStyle: "short" });
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); setSelected((s) => Math.min(past.length - 1, s + 1)); setConfirming(false); }
      if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); setSelected((s) => Math.max(0, s - 1)); setConfirming(false); }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [dialog, past.length]);
  const totals = current && chosen && counts ? counts(current, chosen) : null;
  const runRestore = async () => {
    if (!restore || !target || busy) return;
    if (!confirming) { setConfirming(true); return; }
    setBusy(true); setError("");
    try { await restore.run(target); setDone(true); setConfirming(false); }
    catch (err) { setError(errorMessage(err, t.unavailable)); }
    finally { setBusy(false); }
  };
  const doc = (v: V, body: ReactNode) => (
    <article className="vb-doc">
      <header className="vb-doc__head"><History size={14} aria-hidden /><span>{v.name}</span></header>
      {body}
    </article>
  );
  return (
    <div ref={dialog} className="vb" role="dialog" aria-modal="true" aria-label={label ?? t.history} tabIndex={-1} dir={locale === "ar" ? "rtl" : "ltr"} data-phone-view={phoneView}>
      <div className="vb-backdrop" aria-hidden />
      {status === "loading" ? (
        <p className="vb-status" role="status">{t.loading}</p>
      ) : status === "unavailable" || !current ? (
        <p className="vb-status">{t.unavailable}</p>
      ) : (
        <>
          <div className="vb-phone-switch ws-segmented" role="group" aria-label={t.showing}>
            <button type="button" aria-pressed={phoneView === "past"} disabled={!past.length} onClick={() => setPhoneView("past")}>{t.showPast}</button>
            <button type="button" aria-pressed={phoneView === "current"} onClick={() => { setPhoneView("current"); setConfirming(false); }}>{t.showCurrent}</button>
          </div>
          <div className="vb-layout">
            <section className="vb-pane vb-pane--current" aria-label={currentLabel}>
              <div className="vb-stack">{doc(current, sheet(current, { against: chosen, side: "base", front: true }))}</div>
              <p className="vb-caption"><strong>{currentLabel}</strong><span>{when(current)}{current.detail ? ` · ${current.detail}` : ""}</span></p>
            </section>
            <section className="vb-pane vb-pane--past" aria-label={chosen ? `${chosen.name}, ${when(chosen)}` : t.older}>
              {past.length === 0 ? (
                <div className="vb-stack"><div className="vb-doc vb-doc--empty"><History size={26} aria-hidden /><p>{onlyOne ?? t.onlyOne}</p></div></div>
              ) : (
                <div className="vb-stack">
                  {past.map((v, i) => {
                    const d = i - selected;
                    if (d > 3 || d < -1) return null;
                    return (
                      <div key={v.key} className="vb-card" data-depth={d < 0 ? "ahead" : d} style={{ ["--d" as string]: Math.max(0, d) }} aria-hidden={d !== 0 || undefined}
                        onClick={d > 0 ? () => pick(i) : undefined}>
                        {doc(v, sheet(v, { against: d === 0 ? current : undefined, side: "other", front: d === 0 }))}
                      </div>
                    );
                  })}
                </div>
              )}
              {chosen && <p key={chosen.key} className="vb-caption" data-swap><strong>{chosen.name}</strong><span>{when(chosen)}{chosen.detail ? ` · ${chosen.detail}` : ""}</span></p>}
            </section>
            {past.length > 0 && (
              <nav className="vb-timeline" aria-label={t.timeline}>
                <button type="button" className="vb-arrow" aria-label={t.older} disabled={selected >= past.length - 1} onClick={() => pick(selected + 1)}><ChevronUp size={18} aria-hidden /></button>
                <ol>
                  {[...past].reverse().map((v) => {
                    const i = past.indexOf(v);
                    return (
                      <li key={v.key}>
                        <button type="button" aria-current={i === selected ? "true" : undefined} onClick={() => pick(i)} aria-label={`${v.name}, ${when(v)}`}>
                          <span className="vb-timeline__label">{formatDateTime(locale, v.at, { month: "short", day: "numeric" })}</span>
                          <span className="vb-timeline__tick" />
                        </button>
                      </li>
                    );
                  })}
                  <li aria-hidden className="vb-timeline__now"><span className="vb-timeline__label">{t.now}</span><span className="vb-timeline__tick" /></li>
                </ol>
                <button type="button" className="vb-arrow" aria-label={t.newer} disabled={selected <= 0} onClick={() => pick(selected - 1)}><ChevronDown size={18} aria-hidden /></button>
              </nav>
            )}
          </div>
          <footer className="vb-bar">
            {totals && (
              <p className="vb-changes" aria-live="polite">
                {totals.changed + totals.added + totals.removed === 0 ? t.noChanges : t.changes(fmt(totals.changed), fmt(totals.added), fmt(totals.removed))}
              </p>
            )}
            {footnote && past.length > 0 && <p className="vb-footnote">{footnote}</p>}
            {confirming && restore && <p className="vb-confirm" role="alert">{restore.warning}</p>}
            {error && <p className="vb-error" role="alert">{error}</p>}
            {done && <p className="vb-confirm" role="status">{t.restored}</p>}
            <div className="vb-actions">
              {restore && target && (
                <>
                  {confirming && <button type="button" className="vb-restore" onClick={() => setConfirming(false)}>{t.cancel}</button>}
                  <button type="button" className="vb-restore" data-confirm={confirming || undefined} disabled={busy || restore.disabled} onClick={() => void runRestore()}>
                    {busy ? t.restoring : restore.label}
                  </button>
                </>
              )}
              <button type="button" data-close className="vb-done" onClick={onClose}>{t.done}</button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

/** Compares two lists of items by id, by a signature of what matters. */
export function compareItems<T>(base: readonly T[], other: readonly T[], id: (item: T) => string, sig: (item: T) => string = (x) => JSON.stringify(x)) {
  const mine = new Map(base.map((x) => [id(x), x]));
  const theirs = new Map(other.map((x) => [id(x), x]));
  const change = (item: T, side: "base" | "other"): VersionChange => {
    const counterpart = side === "base" ? theirs.get(id(item)) : mine.get(id(item));
    if (!counterpart) return side === "base" ? "added" : "removed";
    return sig(item) === sig(counterpart) ? "same" : "changed";
  };
  const counts: ChangeCounts = { changed: 0, added: 0, removed: 0 };
  for (const x of base) { const c = change(x, "base"); if (c === "changed" || c === "added") counts[c]++; }
  for (const x of other) if (!mine.has(id(x))) counts.removed++;
  return { mine, theirs, change, counts };
}

const changeLabels = {
  en: { added: "Added", removed: "Removed", changed: "Changed" },
  ar: { added: "أُضيف", removed: "أُزيل", changed: "تغيّر" },
};

/** A badge for an item that differs from the version it is compared with. */
export function ChangeBadge({ change }: { change: VersionChange }) {
  const t = useCopy(changeLabels);
  if (change === "same") return null;
  return <span className="vb-badge" data-change={change}>{t[change]}</span>;
}

export type SheetItem = { id: string; title: ReactNode; body?: ReactNode; level?: "heading" | "group"; change?: VersionChange };

/** A plain sheet for lessons, courses and flashcards: one row per item, with its change marked. */
export function ItemSheet({ items, meta }: { items: SheetItem[]; meta?: ReactNode }) {
  return (
    <>
      {meta && <p className="vb-meta">{meta}</p>}
      <ol className="vb-items">
        {items.map((item, n) => (
          <li key={item.id} className="vb-item" data-change={item.change ?? "same"} data-level={item.level} style={{ ["--n" as string]: Math.min(n, 8) }}>
            <div className="vb-item__head"><p className="vb-item__title" dir="auto">{item.title}</p>{item.change && <ChangeBadge change={item.change} />}</div>
            {item.body && <div className="vb-item__body" dir="auto">{item.body}</div>}
          </li>
        ))}
      </ol>
    </>
  );
}
