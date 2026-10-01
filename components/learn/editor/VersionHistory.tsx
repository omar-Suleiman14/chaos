"use client";

import { useMemo, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { WsConfirm, WsDialog } from "@/components/workspace/primitives";
import { diffDocuments, excerpt, readingMinutes } from "@/lib/learn/doc";
import { useLearnCapabilities, useLessonVersions } from "@/lib/learn/data";
import type { Lesson } from "@/lib/learn/types";
import { formatDateTime, useCopy, useLocale } from "@/lib/i18n";
import BlockRenderer from "../reader/BlockRenderer";
import { errorMessage } from "@/lib/errors";

const copy = {
  en: {
    title: "Version history", lead: "Every publish is kept. Restoring copies a version into your draft; readers keep the current version until you publish.",
    empty: "Nothing published yet. Versions appear here each time you publish.", current: "Live now", by: (n: string) => `by ${n}`,
    view: { changes: "Changes", read: "Read" }, vsPrev: (v: number) => `Compared with version ${v}`, first: "First published version",
    added: "Added", removed: "Removed", changed: "Changed", noDiff: "Same content as the previous version (settings or title may differ).",
    restore: (v: number) => `Restore version ${v} to draft`, restoreTitle: (v: number) => `Restore version ${v}?`,
    restoreBody: "Your current draft will be replaced by this version. Readers won't see it until you publish. The current draft is not kept, so publish it first if you need it.",
    restoreUnavailable: "Restoring needs the Learn service.", minutes: (n: number) => `${n} min read`, titleChanged: (a: string, b: string) => `Title: “${a}” → “${b}”`,
  },
  ar: {
    title: "سجل الإصدارات", lead: "يُحفظ كل نشر. الاستعادة تنسخ الإصدار إلى مسودتك؛ ويبقى القرّاء على الإصدار الحالي حتى تنشر.",
    empty: "لم يُنشر شيء بعد. تظهر الإصدارات هنا في كل مرة تنشر.", current: "المنشور الآن", by: (n: string) => `بواسطة ${n}`,
    view: { changes: "التغييرات", read: "اقرأ" }, vsPrev: (v: number) => `مقارنة بالإصدار ${v}`, first: "أول إصدار منشور",
    added: "مضاف", removed: "محذوف", changed: "معدّل", noDiff: "المحتوى مطابق للإصدار السابق (قد تختلف الإعدادات أو العنوان).",
    restore: (v: number) => `استعد الإصدار ${v} إلى المسودة`, restoreTitle: (v: number) => `استعادة الإصدار ${v}؟`,
    restoreBody: "ستُستبدل مسودتك الحالية بهذا الإصدار. لن يراه القرّاء حتى تنشر. لا تُحفظ المسودة الحالية، فانشرها أولًا إن احتجتها.",
    restoreUnavailable: "تحتاج الاستعادة إلى خدمة Learn.", minutes: (n: number) => `${n} د قراءة`, titleChanged: (a: string, b: string) => `العنوان: «${a}» ← «${b}»`,
  },
};

export default function VersionHistory({ lesson, onClose, onRestore, disabled = false, error }: { lesson: Lesson; onClose: () => void; onRestore: (version: number) => void | Promise<unknown>; disabled?: boolean; error?: string }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const caps = useLearnCapabilities();
  const loaded = useLessonVersions(lesson.id);
  const versions = loaded ?? [];
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [selected, setSelected] = useState<number | undefined>(versions[0]?.version);
  const [mode, setMode] = useState<"changes" | "read">("changes");
  const [confirm, setConfirm] = useState(false);
  const current = versions.find((v) => v.version === selected) ?? versions[0];
  const previous = current ? versions.find((v) => v.version < current.version) : undefined;
  const changes = useMemo(() => current ? diffDocuments(previous?.content ?? [], current.content) : [], [current, previous]);

  return (
    <WsDialog title={t.title} description={t.lead} onClose={onClose} wide>
      {loaded === undefined ? <div className="ws-skeleton ws-skeleton--panel" aria-busy="true" /> : !versions.length ? <p className="lx-muted">{t.empty}</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 220px) minmax(0, 1fr)", gap: 16, minHeight: 320 }} className="lx-history">
          <div className="lx-versions" role="listbox" aria-label={t.title}>
            {versions.map((v) => (
              <button key={v.version} type="button" role="option" aria-selected={v.version === current?.version} className="lx-version" onClick={() => setSelected(v.version)}>
                <strong style={{ fontSize: 14 }}><History size={13} aria-hidden /> v{v.version}{lesson.published?.version === v.version ? ` · ${t.current}` : ""}</strong>
                <span className="lx-muted">{formatDateTime(locale, v.publishedAt, { dateStyle: "medium", timeStyle: "short" })} {t.by(v.publishedBy)}</span>
                {v.note && <span style={{ fontSize: 12.5 }}>{v.note}</span>}
              </button>
            ))}
          </div>
          {current && (
            <div style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
              <div className="lx-panel__row" style={{ flexWrap: "wrap" }}>
                <div className="lx-chips" role="radiogroup" aria-label={t.title}>
                  {(["changes", "read"] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} className="lx-chip" onClick={() => setMode(m)}>{t.view[m]}</button>)}
                </div>
                {lesson.published?.version !== current.version || lesson.draft.updatedAt !== lesson.publishedDraftAt ? (
                  <button type="button" className="ws-btn ws-btn--sm" disabled={!caps.versionRestore || disabled || busy} title={caps.versionRestore ? undefined : t.restoreUnavailable} onClick={() => setConfirm(true)}><RotateCcw size={14} aria-hidden />{t.restore(current.version)}</button>
                ) : null}
              </div>
              {mode === "changes" ? (
                <div className="lx-diff">
                  <span className="lx-muted">{previous ? t.vsPrev(previous.version) : t.first} · {t.minutes(readingMinutes(current.content))}</span>
                  {previous && previous.meta.title !== current.meta.title && <div className="lx-diff__item" data-kind="changed">{t.titleChanged(previous.meta.title, current.meta.title)}</div>}
                  {!changes.length && <p className="lx-muted">{t.noDiff}</p>}
                  {changes.slice(0, 80).map((c) => (
                    <div key={c.blockId + c.kind} className="lx-diff__item" data-kind={c.kind}>
                      <strong style={{ fontSize: 11 }}>{t[c.kind]}</strong>{" "}
                      {c.kind === "changed" ? <><del>{excerpt(c.beforeText ?? "", 160)}</del> → <ins>{excerpt(c.afterText ?? "", 160)}</ins></> : excerpt((c.kind === "added" ? c.afterText : c.beforeText) || c.type, 220)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="lx-article" style={{ fontSize: 15, maxHeight: "55dvh", overflow: "auto", border: "1px solid var(--ws-line)", borderRadius: 10, padding: 16 }} lang={current.meta.language} dir={current.meta.language === "ar" ? "rtl" : "ltr"}>
                  <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{current.meta.title}</h2>
                  <BlockRenderer content={current.content} sources={lesson.sources} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {(failure || error) && <p className="lx-error" role="alert">{failure || error}</p>}
      {confirm && current && <WsConfirm title={t.restoreTitle(current.version)} body={t.restoreBody} confirmLabel={t.restore(current.version)} danger={false} onClose={() => setConfirm(false)} onConfirm={() => { if (busy || disabled) return; setBusy(true); setFailure(""); void Promise.resolve().then(() => onRestore(current.version)).catch(err => setFailure(errorMessage(err))).finally(() => setBusy(false)); }} />}
    </WsDialog>
  );
}
