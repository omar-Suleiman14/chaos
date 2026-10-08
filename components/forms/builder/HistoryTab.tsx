"use client";

import { useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { useMutation, useQueries } from "convex/react";
import { History } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useBuilderLabels } from "@/components/forms/formThemeLabels";
import { formatDate, useCopy, useLocale } from "@/lib/i18n";
import type { FormDefinition } from "@/convex/formLogic";
import VersionBrowser from "@/components/versions/VersionBrowser";
import { QuestionSheet, compareQuestions, type SheetQuestion } from "@/components/versions/QuestionSheet";

const copy = {
  en: {
    none: "No published versions yet. Each time you publish, it appears here as a timeline, and responses always stay linked to the version they answered.",
    today: "Today", yesterday: "Yesterday", versions: "Versions", version: (n: number) => `Version ${n}`, live: " · live",
    browse: "Browse versions", browseHelp: "See every version side by side with the live one, with what changed marked.", liveVersion: "Live version",
    restoreWarning: "Your draft will be replaced by this version. Respondents keep the live version until you publish.",
    copied: (n: number) => `Version ${n} was copied into the draft. Publish to make it live.`, copyIntoDraft: "Copy into draft",
    textBlock: "Text block",
    saveFirst: "Save your pending changes before restoring a version.",
  },
  ar: {
    none: "لا توجد نسخ منشورة بعد. تظهر هنا كل نسخة تنشرها في جدول زمني، وتبقى الردود مرتبطة بالنسخة التي أجاب عنها أصحابها.",
    today: "اليوم", yesterday: "أمس", versions: "النسخ", version: (n: number) => `النسخة ${n}`, live: " · منشورة",
    browse: "تصفّح النسخ", browseHelp: "شاهد كل نسخة بجانب النسخة المنشورة مع تمييز ما تغيّر.", liveVersion: "النسخة المنشورة",
    restoreWarning: "ستُستبدل مسودتك بهذه النسخة. يبقى المجيبون على النسخة المنشورة حتى تنشر.",
    copied: (n: number) => `نُسخت النسخة ${n} إلى المسودة. انشر لتصبح منشورة.`, copyIntoDraft: "انسخ إلى المسودة",
    textBlock: "كتلة نص",
    saveFirst: "احفظ التغييرات المعلقة قبل استعادة نسخة.",
  },
};

/** How a form question reads on a version sheet. Text-only items (sections, statements) keep their label. */
function sheetQuestions(def: FormDefinition, fallback: (type: string) => string): SheetQuestion[] {
  return def.fields.map((f) => {
    const options = f.options?.map((o) => o.label) ?? [];
    const key = f.quiz?.correctOptionIds.map((id) => f.options?.find((o) => o.id === id)?.label).filter((x): x is string => !!x) ?? [];
    return { id: f.id, text: f.label || fallback(f.type), options, answerKey: key, points: f.quiz?.points ?? 0, timeLimit: null };
  });
}

/** Builder History: the published versions as a timeline; any of them opens in the version browser (games too). */
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
  const [open, setOpen] = useState<string | null>(null);
  const restore = useMutation(api.forms.restoreVersion);
  const busy = useRef(false);
  // The newest 30 versions are browsable; each loads once the browser opens.
  const shown = versions.slice(0, 30);
  const loaded = useQueries(open === null ? {} : Object.fromEntries(shown.map((v) => [String(v.version), { query: api.forms.getVersion, args: { formId, version: v.version } }])));
  const browsed = shown.flatMap((v) => {
    const row = loaded[String(v.version)] as { definition: FormDefinition } | null | undefined | Error;
    if (!row || row instanceof Error) return [];
    return [{ key: String(v.version), name: t.version(v.version), at: v.publishedAt, detail: v.publishedByName, quiz: !!row.definition.quiz?.enabled, questions: sheetQuestions(row.definition, (type) => labels.fieldType(type as never) || t.textBlock) }];
  });
  const pending = open !== null && shown.some((v) => loaded[String(v.version)] === undefined);

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
  const live = String(versions[0].version);
  return (
    <div className="grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-8">
      <nav aria-label={t.versions} className="ws-timeline">
        {days.map((day) => (
          <div key={day.label}>
            <p className="ws-timeline__day">{day.label}</p>
            <ol>
              {day.items.map((v, i) => (
                <li key={v.version}>
                  <button type="button" onClick={() => setOpen(String(v.version))} className="ws-timeline__item">
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
      <section className="space-y-3 min-w-0 self-start ws-card p-5" aria-label={t.browse}>
        <p className="text-sm text-muted-foreground max-w-prose">{t.browseHelp}</p>
        <button type="button" className="ws-btn ws-btn--primary" onClick={() => setOpen(versions[1] ? String(versions[1].version) : live)}><History size={16} aria-hidden />{t.browse}</button>
      </section>
      {open !== null && (
        <VersionBrowser status={pending ? "loading" : browsed.length ? "ready" : "unavailable"} current={browsed[0]} currentLabel={t.liveVersion} past={browsed.slice(1)}
          initialKey={open === live ? undefined : open} onClose={() => setOpen(null)}
          counts={(a, b) => compareQuestions(a.questions, b.questions).counts}
          sheet={(v, { against, side }) => <QuestionSheet questions={v.questions} against={against?.questions} side={side} showPoints={v.quiz} />}
          restore={canEdit ? {
            label: t.copyIntoDraft, warning: t.restoreWarning, current: true,
            run: async (v) => {
              if (busy.current) return;
              busy.current = true;
              try {
                if (!(await beforeRestore())) throw new Error(t.saveFirst);
                await restore({ formId, version: Number(v.key), expectedRevision: revision() });
                toast.success(t.copied(Number(v.key)));
              } finally { busy.current = false; }
            },
          } : undefined} />
      )}
    </div>
  );
}
