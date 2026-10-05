"use client";

import { useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { useMutation, useQuery } from "convex/react";
import { format, isToday, isYesterday } from "date-fns";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useBuilderLabels } from "@/components/forms/formThemeLabels";
import { formatDate, useCopy, useLocale } from "@/lib/i18n";

const copy = {
  en: {
    none: "No published versions yet. Each time you publish, it appears here as a timeline, and responses always stay linked to the version they answered.",
    today: "Today", yesterday: "Yesterday", versions: "Versions", version: (n: number) => `Version ${n}`, live: " · live",
    details: "Version details", loading: "Loading…", notFound: "Version not found.",
    copied: (n: number) => `Version ${n} was copied into the draft. Publish to make it live.`, copyIntoDraft: "Copy into draft",
    textBlock: "Text block", required: ", required", conditional: ", conditional",
    saveFirst: "Save your pending changes before restoring a version.",
  },
  ar: {
    none: "لا توجد نسخ منشورة بعد. تظهر هنا كل نسخة تنشرها في جدول زمني، وتبقى الردود مرتبطة بالنسخة التي أجاب عنها أصحابها.",
    today: "اليوم", yesterday: "أمس", versions: "النسخ", version: (n: number) => `النسخة ${n}`, live: " · منشورة",
    details: "تفاصيل النسخة", loading: "جارٍ التحميل…", notFound: "النسخة غير موجودة.",
    copied: (n: number) => `نُسخت النسخة ${n} إلى المسودة. انشر لتصبح منشورة.`, copyIntoDraft: "انسخ إلى المسودة",
    textBlock: "كتلة نص", required: "، إلزامي", conditional: "، مشروط",
    saveFirst: "احفظ التغييرات المعلقة قبل استعادة نسخة.",
  },
};

export default function HistoryTab({ formId, versions, canEdit, revision, beforeRestore }: {
  formId: Id<"forms">;
  versions: { version: number; publishedAt: number; publishedByName: string }[];
  canEdit: boolean;
  revision: () => number;
  /** Save pending edits first so a restore never races the autosave. */
  beforeRestore: () => Promise<boolean>;
}) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const labels = useBuilderLabels();
  const [selected, setSelected] = useState<number | null>(versions[0]?.version ?? null);
  const version = useQuery(api.forms.getVersion, selected !== null ? { formId, version: selected } : "skip");
  const restore = useMutation(api.forms.restoreVersion);
  const [restoring, setRestoring] = useState(false);
  const busy = useRef(false);

  if (!versions.length) {
    return <p className="text-sm text-muted-foreground max-w-xl">{t.none}</p>;
  }
  // Time is the shape of this data, so it reads as a timeline grouped by day.
  const days: { label: string; items: typeof versions }[] = [];
  for (const v of versions) {
    const label = isToday(v.publishedAt) ? t.today : isYesterday(v.publishedAt) ? t.yesterday : locale === "ar" ? formatDate(locale, v.publishedAt, { day: "numeric", month: "long", year: "numeric" }) : format(v.publishedAt, "d MMMM yyyy");
    const last = days.at(-1);
    if (last?.label === label) last.items.push(v); else days.push({ label, items: [v] });
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-8">
      <nav aria-label={t.versions} className="ws-timeline">
        {days.map((day) => (
          <div key={day.label}>
            <p className="ws-timeline__day">{day.label}</p>
            <ol>
              {day.items.map((v, i) => (
                <li key={v.version}>
                  <button type="button" onClick={() => setSelected(v.version)} aria-current={selected === v.version} className="ws-timeline__item">
                    <span className="ws-timeline__dot" data-latest={v.version === versions[0].version && i === 0} aria-hidden="true" />
                    <span className="ws-timeline__main">
                      <span className="font-semibold">{t.version(v.version)}{v.version === versions[0].version && <span className="ws-timeline__live">{t.live}</span>}</span>
                      <span className="ws-timeline__meta">
                        <span className="ws-avatar" aria-hidden="true">{v.publishedByName.trim().charAt(0).toUpperCase() || "?"}</span>
                        {v.publishedByName}
                      </span>
                    </span>
                    <time className="ws-timeline__time" dateTime={new Date(v.publishedAt).toISOString()}>{format(v.publishedAt, "HH:mm")}</time>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </nav>
      <section className="space-y-3 min-w-0" aria-label={t.details}>
        {version === undefined ? <p className="text-sm text-muted-foreground">{t.loading}</p> : version === null ? <p className="text-sm">{t.notFound}</p> : (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-bold">{version.definition.title}</h2>
              {canEdit && (
                <button type="button" className="ws-btn ws-btn--sm" disabled={restoring} onClick={async () => {
                  if (busy.current) return;
                  busy.current = true;
                  setRestoring(true);
                  try {
                    if (!(await beforeRestore())) { toast.warning(t.saveFirst); return; }
                    await restore({ formId, version: version.version, expectedRevision: revision() });
                    toast.success(t.copied(version.version));
                  } catch (err) {
                    toast.error(err);
                  } finally {
                    busy.current = false;
                    setRestoring(false);
                  }
                }}>{t.copyIntoDraft}</button>
              )}
            </div>
            <ol className="list-decimal ps-5 space-y-1 text-sm">
              {version.definition.fields.map((f) => (
                <li key={f.id}>{f.label || <em>{t.textBlock}</em>} <span className="text-xs text-muted-foreground">({labels.fieldType(f.type)}{f.required ? t.required : ""}{f.showIf ? t.conditional : ""})</span></li>
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}
