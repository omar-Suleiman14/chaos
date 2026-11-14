"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Save, ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ExamSettings } from "@/convex/examSettingsModel";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/lib/toast";

const initial: ExamSettings = {
  mode: "anytime", durationMinutes: 60, maxAttempts: 1,
  requireAllAnswers: false, allowEarlySubmission: true,
  timeoutAction: "auto_submit", passingPercent: 50,
  resultVisibility: "manual", showCorrectAnswers: false, showExplanations: false,
};
function localDateTime(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "";
  const date = new Date(value);
  return new Date(value - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function parseLocal(value: string) {
  return value ? new Date(value).getTime() : undefined;
}
const l = {
  en: {
    title: "Exam settings & schedule", introduction: "Seal the selected questions first. Settings are private until a later PR assigns an approved course audience.",
    seal: "Seal current questions", sealed: "Sealed snapshot", notSealed: "No sealed snapshot yet",
    changed: "Draft questions changed. Seal this revision before preparing the exam.",
    window: "Availability", anytime: "Anytime after assignment", scheduled: "Scheduled window",
    opens: "Opens (your local time)", closes: "Closes (your local time)", duration: "Time limit (minutes)",
    attempts: "Maximum attempts", requireAll: "Require every answer before submission",
    early: "Allow submission before the timer ends", timeout: "When time runs out",
    autoSubmit: "Submit saved answers", expire: "Mark attempt expired",
    pass: "Passing score (%)", visibility: "Results shown",
    immediate: "Immediately after grading", afterClose: "After the exam window closes", manual: "Only when the doctor releases them",
    answers: "Show correct answers after result release", explanations: "Show explanations after result release",
    save: "Save exam settings", saved: "Settings saved", prepare: "Ready for audience setup",
    unprepare: "Mark as not ready", prepared: "Prepared (not assigned)", private: "Private · student entry disabled",
    unsaved: "Save the settings before changing readiness.", missing: "Seal and save settings before preparing.",
    pending: "Working…", error: "Could not update exam settings.",
    warning: "No student can start this exam yet. PR 14 must add approved-course audience checks and Due Exams; later PRs enforce timer, submission and result policies.",
  },
  ar: {
    title: "إعدادات الامتحان والجدول", introduction: "ثبّت الأسئلة المختارة أولًا. تظل الإعدادات خاصة لحين تحديد طلاب الدورة المسموح لهم في طلب لاحق.",
    seal: "ثبّت نسخة الأسئلة الحالية", sealed: "النسخة الثابتة", notSealed: "لا توجد نسخة ثابتة بعد",
    changed: "تغيرت الأسئلة في المسودة. ثبّت النسخة الجديدة قبل تجهيز الامتحان.",
    window: "موعد الإتاحة", anytime: "في أي وقت بعد التكليف", scheduled: "بموعد بداية ونهاية",
    opens: "البداية (بتوقيت جهازك)", closes: "النهاية (بتوقيت جهازك)", duration: "مدة الامتحان بالدقائق",
    attempts: "أقصى عدد محاولات", requireAll: "اشترط الإجابة على كل الأسئلة قبل التسليم",
    early: "اسمح بالتسليم قبل انتهاء الوقت", timeout: "عند انتهاء الوقت",
    autoSubmit: "تسليم الإجابات المحفوظة", expire: "اعتبار المحاولة منتهية",
    pass: "نسبة النجاح (%)", visibility: "إظهار النتيجة",
    immediate: "بعد التصحيح مباشرة", afterClose: "بعد إغلاق موعد الامتحان", manual: "عندما يعلنها الدكتور فقط",
    answers: "إظهار الإجابات الصحيحة بعد إعلان النتيجة", explanations: "إظهار الشرح بعد إعلان النتيجة",
    save: "احفظ إعدادات الامتحان", saved: "تم الحفظ", prepare: "جاهز لتحديد الطلاب",
    unprepare: "إلغاء الجاهزية", prepared: "جاهز · لم يكلّف الطلاب", private: "خاص · دخول الطلاب مقفل",
    unsaved: "احفظ إعدادات الامتحان أولًا.", missing: "ثبّت الامتحان واحفظ إعداداته أولًا.",
    pending: "جارٍ التنفيذ…", error: "تعذر تحديث إعدادات الامتحان.",
    warning: "لا يستطيع أي طالب بدء الامتحان حتى الآن. الطلب التالي يضيف تكليف طلاب الدورة وامتحاناتهم المستحقة، ثم يأتي تطبيق الوقت والتسليم والنتائج في الطلبات اللاحقة.",
  },
} as const;

export function ExamReleaseSettings({
  draftId, draftRevision, canSeal,
}: { draftId: Id<"examBuilderDrafts">; draftRevision: number; canSeal: boolean }) {
  const { locale } = useLocale();
  const t = l[locale === "ar" ? "ar" : "en"];
  const info = useQuery(api.examSettings.getForDraft, { draftId });
  const seal = useMutation(api.examRuntime.sealDraft);
  const save = useMutation(api.examSettings.saveForDraft);
  const prepare = useMutation(api.examSettings.setPrepared);
  const [settings, setSettings] = useState<ExamSettings>(initial);
  const [loadedKey, setLoadedKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!info) return;
    const key = String(info.snapshotId) + ":" + info.revision;
    if (key !== loadedKey) {
      setSettings(info.settings);
      setLoadedKey(key);
    }
  }, [info, loadedKey]);

  const set = <K extends keyof ExamSettings>(key: K, value: ExamSettings[K]) =>
    setSettings(old => ({ ...old, [key]: value }));
  const dirty = !!info && JSON.stringify(settings) !== JSON.stringify(info.settings);
  const current = !!info?.snapshotId && info.snapshotDraftRevision === draftRevision;
  const run = async (fn: () => Promise<unknown>, message?: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); if (message) toast.success(message); }
    catch (error) { toast.error(error, { fallback: t.error }); }
    finally { setBusy(false); }
  };
  const changeMode = (mode: "scheduled" | "anytime") => {
    if (mode === "scheduled") {
      const start = Date.now() + 60 * 60000;
      setSettings(old => ({
        ...old, mode, opensAt: start, closesAt: start + 120 * 60000,
      }));
    } else {
      setSettings(old => ({
        ...old, mode, opensAt: undefined, closesAt: undefined,
        resultVisibility: old.resultVisibility === "after_close" ? "manual" : old.resultVisibility,
      }));
    }
  };

  return <section className="cb-section grid gap-4" aria-labelledby="exam-settings-title">
    <div className="space-y-1">
      <h2 id="exam-settings-title">{t.title}</h2>
      <p className="cb-note">{t.introduction}</p>
    </div>
    <div className="flex flex-wrap gap-3 items-center">
      <button className="ws-btn ws-btn--ghost" type="button" disabled={busy || !canSeal}
        onClick={() => void run(() => seal({ draftId, expectedRevision: draftRevision }))}>
        <ShieldCheck size={16} aria-hidden />{t.seal}
      </button>
      <span className="text-sm text-muted-foreground">{info?.snapshotId
        ? t.sealed + " #" + info.snapshotVersion : t.notSealed}</span>
    </div>
    {info?.snapshotId && !current && <p role="status" className="text-sm text-amber-600">{t.changed}</p>}
    <fieldset disabled={!info?.snapshotId || busy} className="grid gap-4 disabled:opacity-60">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">{t.window}
          <select className="kb-input" value={settings.mode}
            onChange={e => changeMode(e.target.value as "anytime" | "scheduled")}>
            <option value="anytime">{t.anytime}</option>
            <option value="scheduled">{t.scheduled}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">{t.duration}
          <input className="kb-input" type="number" min={1} max={480} step={1}
            value={settings.durationMinutes} onChange={e => set("durationMinutes", Number(e.target.value))} />
        </label>
        {settings.mode === "scheduled" && <>
          <label className="grid gap-1 text-sm">{t.opens}
            <input className="kb-input" type="datetime-local" value={localDateTime(settings.opensAt)}
              onChange={e => set("opensAt", parseLocal(e.target.value))} />
          </label>
          <label className="grid gap-1 text-sm">{t.closes}
            <input className="kb-input" type="datetime-local" value={localDateTime(settings.closesAt)}
              onChange={e => set("closesAt", parseLocal(e.target.value))} />
          </label>
        </>}
        <label className="grid gap-1 text-sm">{t.attempts}
          <input className="kb-input" type="number" min={1} max={3} step={1}
            value={settings.maxAttempts} onChange={e => set("maxAttempts", Number(e.target.value))} />
        </label>
        <label className="grid gap-1 text-sm">{t.timeout}
          <select className="kb-input" value={settings.timeoutAction}
            onChange={e => set("timeoutAction", e.target.value as ExamSettings["timeoutAction"])}>
            <option value="auto_submit">{t.autoSubmit}</option>
            <option value="expire">{t.expire}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">{t.pass}
          <input className="kb-input" type="number" min={0} max={100} step={0.01}
            value={settings.passingPercent} onChange={e => set("passingPercent", Number(e.target.value))} />
        </label>
        <label className="grid gap-1 text-sm">{t.visibility}
          <select className="kb-input" value={settings.resultVisibility}
            onChange={e => set("resultVisibility", e.target.value as ExamSettings["resultVisibility"])}>
            <option value="manual">{t.manual}</option>
            <option value="immediate">{t.immediate}</option>
            {settings.mode === "scheduled" && <option value="after_close">{t.afterClose}</option>}
          </select>
        </label>
      </div>
      <div className="grid gap-3">
        {([
          ["requireAllAnswers", t.requireAll],
          ["allowEarlySubmission", t.early],
          ["showCorrectAnswers", t.answers],
          ["showExplanations", t.explanations],
        ] as const).map(([key, title]) =>
          <label key={key} className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={settings[key]} onChange={e => set(key, e.target.checked)} />
            <span>{title}</span>
          </label>)}
      </div>
    </fieldset>
    <div className="flex flex-wrap items-center gap-3">
      <button className="ws-btn ws-btn--primary" type="button" disabled={busy || !info?.snapshotId || (!dirty && info.revision > 0)}
        onClick={() => void run(() => save({
          draftId, expectedRevision: info!.revision, settings,
        }), t.saved)}>
        <Save size={16} aria-hidden />{busy ? t.pending : t.save}
      </button>
      <button className="ws-btn ws-btn--ghost" type="button"
        disabled={busy || !info?.snapshotId || dirty || !current ||
          (!info.preparedForAudience && info.revision === 0)}
        onClick={() => void run(() => prepare({
          draftId, expectedRevision: info!.revision, prepared: !info!.preparedForAudience,
        }))}>
        <Check size={16} aria-hidden />{info?.preparedForAudience ? t.unprepare : t.prepare}
      </button>
      <span className="text-sm text-muted-foreground">{info?.preparedForAudience ? t.prepared : t.private}</span>
    </div>
    {dirty && <p className="cb-note" role="status">{t.unsaved}</p>}
    <p className="cb-note">{t.warning}</p>
  </section>;
}
