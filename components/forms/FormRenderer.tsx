"use client";

import { ChaosSelect } from "@/components/workspace/ChaosSelect";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Clock, CornerDownLeft, Star, Upload, X } from "lucide-react";
import "./formThemes.css";
import {
  answerError, isAnswerable, isEmptyAnswer, isRtl, localizeEnding, localizeField, localizedMeta, pipeText, sectionsOf, visibleFieldIds,
} from "@/convex/formLogic";
import { parseNumberInput } from "@/convex/formLogic";
import type { AnswerValue, Answers, Ending, FormDefinition, FormField, Language } from "@/convex/formLogic";
import { themeChrome, themeCover, themeSound } from "./formThemes";
import { sfx } from "@/lib/sfx";
import type { SfxName } from "@/lib/sfx";
import { haptics } from "@/lib/haptics";
import { useModal } from "@/components/workspace/useModal";

export { themeClass, themeStyle } from "./formThemes";

export interface UploadedFile { uploadId: string; name: string; size: number }

export interface FormRendererProps {
  definition: FormDefinition;
  language: Language;
  answers: Answers;
  onAnswer: (fieldId: string, value: AnswerValue | undefined) => void;
  /** Server-side errors keyed by field id, shown until the answer changes. */
  serverErrors?: Record<string, string>;
  onSubmit: () => void;
  submitting?: boolean;
  submitLabel?: string;
  uploadFile?: (field: FormField, file: File) => Promise<UploadedFile>;
  files?: Record<string, UploadedFile>;
  /** Called with the last field the respondent reached (abandonment analysis). */
  onProgress?: (fieldId: string) => void;
  footer?: React.ReactNode;
  /** Earlier answers were restored: the start screen offers to continue. */
  resuming?: boolean;
  /** Skip the theme's start screen (editing a submitted response, logic debugger). */
  skipCover?: boolean;
}

const ui = {
  en: {
    next: "Next", back: "Back", submit: "Submit", required: "Required", choose: "Choose…", keepOrder: "Keep this order", moveUp: "Move up", moveDown: "Move down",
    upload: "Upload a file", remove: "Remove", step: (a: number, b: number) => `Step ${a} of ${b}`, fix: "Please fix the highlighted questions.", uploading: "Uploading…",
    start: "Start", resume: "Continue", ok: "OK", pressEnter: "press Enter", questions: (n: number) => `${n} question${n === 1 ? "" : "s"}`,
    minutes: (n: number) => `about ${n} min`, swipe: "Swipe up", scrollToStart: "Scroll to start", pressStart: "Press start", player: "Player 1", levels: (n: number) => `${n} levels`,
    clear: "Clear form", clearConfirm: "This will remove your answers from all questions. Clear the form?",
    of: (a: number, b: number) => `${a} of ${b}`, chooseMany: "Choose as many as you like", score: "Your score", fileHint: "PDF, image, text, CSV, Word or Excel · up to 10 MB",
    clearAnswer: "Clear answer", clearRating: (label: string) => `Clear answer for ${label}`, enterNumber: "Enter a number.", scaleValue: (n: number, lo: number, hi: number) => `${n}, from ${lo} to ${hi}`,
  },
  ar: {
    next: "التالي", back: "السابق", submit: "إرسال", required: "مطلوب", choose: "اختر…", keepOrder: "الإبقاء على هذا الترتيب", moveUp: "نقل لأعلى", moveDown: "نقل لأسفل",
    upload: "رفع ملف", remove: "إزالة", step: (a: number, b: number) => `الخطوة ${a} من ${b}`, fix: "يرجى تصحيح الأسئلة المميزة.", uploading: "جارٍ الرفع…",
    start: "ابدأ", resume: "متابعة", ok: "موافق", pressEnter: "اضغط Enter", questions: (n: number) => `${n} سؤال`,
    minutes: (n: number) => `حوالي ${n} دقيقة`, swipe: "اسحب لأعلى", scrollToStart: "مرّر للبدء", pressStart: "اضغط للبدء", player: "اللاعب 1", levels: (n: number) => `${n} مستوى`,
    clear: "مسح النموذج", clearConfirm: "سيؤدي هذا إلى حذف إجاباتك من جميع الأسئلة. هل تريد مسح النموذج؟",
    of: (a: number, b: number) => `${a} من ${b}`, chooseMany: "اختر ما تشاء", score: "درجتك", fileHint: "PDF أو صورة أو نص أو CSV أو Word أو Excel · حتى 10 ميغابايت",
    clearAnswer: "امسح الإجابة", clearRating: (label: string) => `امسح الإجابة عن ${label}`, enterNumber: "أدخل رقمًا.", scaleValue: (n: number, lo: number, hi: number) => `${n}، من ${lo} إلى ${hi}`,
  },
};
export const formUi = ui;

type Step = { key: string; title?: string; description?: string; fields: FormField[] };

function buildSteps(def: FormDefinition, visible: Set<string>): Step[] {
  if (def.presentation === "page") {
    return [{ key: "all", fields: def.fields.filter((f) => visible.has(f.id)) }];
  }
  if (def.presentation === "sections") {
    return sectionsOf(def)
      .filter((g) => !g.section || visible.has(g.section.id))
      .map((g, i) => ({ key: g.section?.id ?? `s${i}`, title: g.section?.label, description: g.section?.description, fields: g.fields.filter((f) => visible.has(f.id)) }))
      .filter((s) => s.fields.length || s.title);
  }
  return def.fields.filter((f) => visible.has(f.id) && f.type !== "section").map((f) => ({ key: f.id, fields: [f] }));
}

/** Answers that complete a one-question step, so immersive modes move on by themselves. */
const autoAdvanceTypes: FormField["type"][] = ["choice", "dropdown", "rating", "scale"];

function useFlow(props: FormRendererProps, rootRef: React.RefObject<HTMLDivElement | null>) {
  const { definition: def, language, answers } = props;
  const navigation = useRef(0);
  const pendingFocus = useRef<string | null>(null);
  const t = ui[language];
  const visible = useMemo(() => visibleFieldIds(def, answers), [def, answers]);
  const steps = useMemo(() => buildSteps(def, visible), [def, visible]);
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [shake, setShake] = useState(0);
  const index = Math.min(stepIndex, Math.max(0, steps.length - 1));
  const step = steps[index];
  const last = index >= steps.length - 1;
  const pack = themeSound(def);
  const play = useCallback((name: SfxName) => sfx.play(name, pack), [pack]);

  useEffect(() => {
    if (stepIndex > steps.length - 1) setStepIndex(Math.max(0, steps.length - 1));
  }, [steps.length, stepIndex]);

  const errorFor = (f: FormField): string | null => {
    if (!isAnswerable(f)) return null;
    const value = answers[f.id];
    if (props.serverErrors?.[f.id] && !touched.has(f.id)) return props.serverErrors[f.id];
    if (isEmptyAnswer(value)) return f.required ? t.required : null;
    return answerError(f, value as AnswerValue);
  };
  const stepErrors = (s: Step | undefined) => (s?.fields ?? []).filter((f) => errorFor(f));

  const reject = (invalid: FormField[]) => {
    setShowErrors(true);
    setShake((n) => n + 1);
    play("error");
    haptics.error();
    const fieldId = invalid[0].id;
    const destination = steps.findIndex((s) => s.fields.some((f) => f.id === fieldId));
    if (destination >= 0 && destination !== index) {
      pendingFocus.current = fieldId;
      setDirection(destination > index ? 1 : -1);
      setStepIndex(destination);
    } else {
      focusField(rootRef.current, fieldId);
    }
  };

  const move = (submit: boolean) => {
    navigation.current++;
    if (props.submitting || (last && !submit)) return;
    const invalid = stepErrors(step);
    if (invalid.length) { reject(invalid); return; }
    setShowErrors(false);
    if (last) {
      const all = steps.flatMap((s) => s.fields).filter((f) => errorFor(f));
      if (all.length) { reject(all); return; }
      props.onSubmit();
      return;
    }
    const next = index + 1;
    setDirection(1);
    setStepIndex(next);
    play("next");
    haptics.light();
    const first = steps[next]?.fields[0];
    if (first) props.onProgress?.(first.id);
  };

  const advance = () => move(false);
  const submit = () => move(true);

  const back = () => {
    navigation.current++;
    if (props.submitting || index === 0) return;
    setShowErrors(false);
    setDirection(-1);
    setStepIndex(index - 1);
    play("back");
  };

  const setAnswer = (field: FormField, value: AnswerValue | undefined) => {
    setTouched((prev) => new Set(prev).add(field.id));
    props.onAnswer(field.id, value);
    props.onProgress?.(field.id);
  };

  useEffect(() => {
    if (pendingFocus.current) {
      focusField(rootRef.current, pendingFocus.current);
      pendingFocus.current = null;
    }
  }, [rootRef, step?.key]);

  const navigationRevision = () => navigation.current;
  return { navigationRevision, def, t, language, answers, steps, step, index, last, direction, showErrors, shake, errorFor, stepErrors, advance, submit, back, setAnswer, play };
}
type Flow = ReturnType<typeof useFlow>;

export default function FormRenderer(props: FormRendererProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const flow = useFlow(props, rootRef);
  const cover = themeCover(props.definition);
  const [started, setStarted] = useState(props.skipCover || cover === "none");
  const mode = props.definition.presentation;

  const start = () => {
    setStarted(true);
    flow.play("start");
    haptics.medium();
  };

  return (
    <div ref={rootRef} dir={isRtl(props.language) ? "rtl" : "ltr"} lang={props.language} className={`form-root form-mode-${mode}`}>
      {!started ? (
        <WelcomeScreen def={props.definition} language={props.language} resuming={!!props.resuming} onStart={start} />
      ) : mode === "conversational" ? (
        <FocusFlow flow={flow} props={props} />
      ) : mode === "swipe" ? (
        <SwipeFlow flow={flow} props={props} />
      ) : (
        <PagedFlow flow={flow} props={props} showHeader={cover === "none"} />
      )}
    </div>
  );
}

// ── Start screens ─────────────────────────────────────────────────────────
function WelcomeScreen({ def, language, resuming, onStart }: { def: FormDefinition; language: Language; resuming: boolean; onStart: () => void }) {
  const t = ui[language];
  const meta = localizedMeta(def, language);
  const cover = themeCover(def);
  const count = def.fields.filter(isAnswerable).length;
  const minutes = Math.max(1, Math.round(def.fields.reduce((sum, f) => sum + (!isAnswerable(f) ? 4 : f.type === "textarea" ? 40 : ["text", "email", "phone", "url", "number", "file", "matrix", "ranking"].includes(f.type) ? 15 : 8), 0) / 60));
  const label = resuming ? t.resume : t.start;
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.defaultPrevented || e.isComposing || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (!ref.current?.closest(".form-cover")?.contains(target)) return;
      if (target.closest("button, a, input, textarea, select")) return;
      e.preventDefault();
      onStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart]);

  // The "scroll" start screen begins on a scroll or an upward swipe, not only a tap.
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = section.current;
    if (!el || cover !== "scroll") return;
    let startY: number | null = null;
    const onWheel = (e: WheelEvent) => { if (e.deltaY > 12) { e.preventDefault(); onStart(); } };
    const onTouchStart = (e: TouchEvent) => { startY = e.touches[0].clientY; };
    const onTouchEnd = (e: TouchEvent) => { if (startY !== null && startY - e.changedTouches[0].clientY > 40) onStart(); startY = null; };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    return () => { el.removeEventListener("wheel", onWheel); el.removeEventListener("touchstart", onTouchStart); el.removeEventListener("touchend", onTouchEnd); };
  }, [cover, onStart]);

  const logo = def.theme.logoUrl && /^https:\/\//.test(def.theme.logoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={def.theme.logoUrl} alt="" className="form-cover-logo" />
    : null;
  const button = (
    <button ref={ref} type="button" onClick={onStart} className="form-btn form-btn-lg form-cover-start">
      {label} <span aria-hidden="true" className="form-btn-arrow">{isRtl(language) ? "←" : "→"}</span>
    </button>
  );
  const enterHint = <p className="form-hint" aria-hidden="true">{t.pressEnter} <kbd><CornerDownLeft size={11} /></kbd></p>;
  const facts = <p className="form-cover-facts"><Clock size={15} aria-hidden="true" /> {t.minutes(minutes)}</p>;
  const description = meta.description && <p className="form-cover-description">{meta.description}</p>;

  return (
    <section ref={section} className="form-cover" data-cover={cover} aria-label={meta.title}>
      {cover === "scroll" ? (
        <div className="form-cover-scroll form-stagger">
          {logo}
          <h1 className="form-cover-title form-heading" style={{ ["--i" as string]: 0 }}>{meta.title}</h1>
          <div style={{ ["--i" as string]: 1 }}>{description}</div>
          <button ref={ref} type="button" onClick={onStart} className="form-cover-cue" style={{ ["--i" as string]: 2 }}>
            <ChevronDown size={26} aria-hidden="true" />
            {resuming ? t.resume : t.scrollToStart}
          </button>
        </div>
      ) : cover === "split" ? (
        <div className="form-cover-split">
          <div className="form-cover-copy form-stagger">
            {logo}
            <h1 className="form-cover-title form-heading" style={{ ["--i" as string]: 0 }}>{meta.title}</h1>
            <div style={{ ["--i" as string]: 1 }}>{description}</div>
            <div className="form-cover-actions" style={{ ["--i" as string]: 2 }}>{button}{enterHint}</div>
            <div style={{ ["--i" as string]: 3 }}>{facts}</div>
          </div>
          <div className="form-cover-art" aria-hidden="true" />
        </div>
      ) : cover === "poster" ? (
        <div className="form-cover-poster">
          <div className="form-cover-copy form-stagger">
            {logo}
            <p className="form-cover-kicker" style={{ ["--i" as string]: 0 }}>{t.questions(count)} · {t.minutes(minutes)}</p>
            <h1 className="form-cover-title form-heading" style={{ ["--i" as string]: 1 }}>{meta.title}</h1>
            <div style={{ ["--i" as string]: 2 }}>{description}</div>
            <div className="form-cover-actions" style={{ ["--i" as string]: 3 }}>{button}{enterHint}</div>
          </div>
          <div className="form-cover-marquee" aria-hidden="true">
            <span>{Array.from({ length: 8 }, () => meta.title).join(" ✦ ")} ✦ </span>
            <span>{Array.from({ length: 8 }, () => meta.title).join(" ✦ ")} ✦ </span>
          </div>
        </div>
      ) : cover === "terminal" ? (
        <div className="form-cover-terminal">
          <div className="form-cover-window">
            <div className="form-cover-window-body">
              <h1 className="form-cover-title form-heading form-type-line">{meta.title}</h1>
              {meta.description && <p className="form-cover-description form-type-line">{meta.description}</p>}
              <p className="form-type-line form-cover-facts">{t.questions(count)}, {t.minutes(minutes)}</p>
              <div className="form-type-line form-cover-actions">{button}</div>
            </div>
          </div>
        </div>
      ) : cover === "arcade" ? (
        <div className="form-cover-arcade form-stagger">
          <p className="form-cover-kicker" style={{ ["--i" as string]: 0 }}>{t.player}</p>
          {logo}
          <h1 className="form-cover-title form-heading" style={{ ["--i" as string]: 1 }}>{meta.title}</h1>
          <div style={{ ["--i" as string]: 2 }}>{description}</div>
          <p className="form-cover-facts" style={{ ["--i" as string]: 3 }}>{t.levels(count)}</p>
          <div className="form-cover-actions" style={{ ["--i" as string]: 4 }}>{button}</div>
          <p className="form-cover-blink" aria-hidden="true">{t.pressStart}</p>
        </div>
      ) : cover === "editorial" ? (
        <div className="form-cover-editorial form-stagger">
          <div className="form-cover-masthead" style={{ ["--i" as string]: 0 }}>
            {logo}
            <span>{new Date().toLocaleDateString(language === "ar" ? "ar" : "en", { year: "numeric", month: "long", day: "numeric" })}</span>
            <span>{t.questions(count)}</span>
          </div>
          <h1 className="form-cover-title form-heading" style={{ ["--i" as string]: 1 }}>{meta.title}</h1>
          <div className="form-cover-columns" style={{ ["--i" as string]: 2 }}>{description}</div>
          <div className="form-cover-actions" style={{ ["--i" as string]: 3 }}>{button}<span className="form-cover-facts">{t.minutes(minutes)}</span></div>
        </div>
      ) : cover === "minimal" ? (
        <div className="form-cover-minimal form-stagger">
          {logo}
          <p className="form-cover-kicker" style={{ ["--i" as string]: 0 }}>{t.questions(count)} · {t.minutes(minutes)}</p>
          <h1 className="form-cover-title form-heading" style={{ ["--i" as string]: 1 }}>{meta.title}</h1>
          <div style={{ ["--i" as string]: 2 }}>{description}</div>
          <div className="form-cover-actions" style={{ ["--i" as string]: 3 }}>{button}{enterHint}</div>
        </div>
      ) : (
        <div className="form-cover-classic form-stagger">
          {logo}
          <h1 className="form-cover-title form-heading" style={{ ["--i" as string]: 0 }}>{meta.title}</h1>
          <div style={{ ["--i" as string]: 1 }}>{description}</div>
          <div className="form-cover-actions" style={{ ["--i" as string]: 2 }}>{button}{enterHint}</div>
          <div style={{ ["--i" as string]: 3 }}>{facts}</div>
        </div>
      )}
    </section>
  );
}

// ── Classic and sections ──────────────────────────────────────────────────
function PagedFlow({ flow, props, showHeader }: { flow: Flow; props: FormRendererProps; showHeader: boolean }) {
  const { def, t, language, answers, steps, step, index, last, direction } = flow;
  const meta = localizedMeta(def, language);
  const topRef = useRef<HTMLDivElement>(null);
  const layout = def.theme.version === 1 ? def.theme.layout ?? "flat" : "flat";
  useStepFocus(topRef, step?.key);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    topRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }, [index]);

  const chrome = themeChrome(def);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearForm = () => {
    setConfirmingClear(false);
    for (const f of def.fields) if (isAnswerable(f) && answers[f.id] !== undefined) props.onAnswer(f.id, undefined);
  };
  const wrapField = (field: FormField, node: React.ReactNode, i: number) => (
    <div key={field.id} className="form-q-card" data-answerable={isAnswerable(field) ? "" : undefined} style={{ ["--i" as string]: Math.min(i + 1, 8) }}>{node}</div>
  );
  const questions = (
    <>
      <div key={step?.key} data-step-focus tabIndex={-1} aria-label={step?.title ?? t.step(index + 1, steps.length)} className={`form-q-stack ${chrome ? "" : "space-y-9"} form-stagger ${index > 0 || steps.length > 1 ? `form-step--${direction > 0 ? "fwd" : "back"}` : ""}`}>
        {step?.title && def.presentation === "sections" && (
          <div style={{ ["--i" as string]: 0 }}>
            <h2 className="text-2xl font-bold form-heading">{pipeText(localizeField(def.fields.find((f) => f.id === step.key) ?? { id: "", type: "section", label: step.title, required: false }, language, def).label, def, answers, language)}</h2>
            {step.description && <p className="text-sm form-muted mt-1">{step.description}</p>}
          </div>
        )}
        {step?.fields.map((field, i) => wrapField(field,
          <FieldView field={localizeField(field, language, def)} def={def} language={language} answers={answers}
            error={flow.showErrors || props.serverErrors?.[field.id] ? flow.errorFor(field) : null}
            onChange={(v) => flow.setAnswer(field, v)} uploadFile={props.uploadFile} files={props.files} play={flow.play} variant="page" />, i))}
      </div>
      {flow.showErrors && flow.stepErrors(step).length > 0 && <p role="alert" className="text-sm form-error font-semibold">{t.fix}</p>}
      <div key={flow.shake} className={`${chrome ? "form-actions" : "flex gap-3 items-center flex-wrap"} ${flow.shake ? "form-shake" : ""}`}>
        <span className={chrome ? "form-actions-start" : "contents"}>
          {index > 0 && <button type="button" onClick={flow.back} className="form-btn form-btn-ghost">{t.back}</button>}
          <button type="submit" disabled={props.submitting} className="form-btn">
            {last ? (props.submitting ? <span className="form-spinner" aria-label="…" /> : props.submitLabel ?? t.submit) : t.next}
            {!last && <span aria-hidden="true" className="form-btn-arrow">{isRtl(language) ? "←" : "→"}</span>}
          </button>
        </span>
        {chrome === "google" && <button type="button" onClick={() => setConfirmingClear(true)} className="form-btn form-btn-ghost form-btn-text">{t.clear}</button>}
        {confirmingClear && <ClearDialog message={t.clearConfirm} clearLabel={t.clear} cancelLabel={language === "ar" ? "إلغاء" : "Cancel"} onCancel={() => setConfirmingClear(false)} onClear={clearForm} />}
      </div>
      {props.footer}
    </>
  );
  const header = showHeader && (index === 0 || def.presentation === "page") && (
    <header className={chrome ? "form-title-card form-stagger" : "mb-8 form-stagger"}>
      {chrome === "microsoft" && def.theme.logoUrl && /^https:\/\//.test(def.theme.logoUrl) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={def.theme.logoUrl} alt="" className="form-cover-logo" />
      )}
      <h1 className="form-page-title form-heading" style={{ ["--i" as string]: 0 }}>{meta.title}</h1>
      {meta.description && <p className="mt-3 form-muted whitespace-pre-line" style={{ ["--i" as string]: 1 }}>{meta.description}</p>}
    </header>
  );
  const progress = steps.length > 1 && (
    <div className="mb-8" aria-live="polite">
      <p className="text-xs form-muted mb-2">{t.step(index + 1, steps.length)}</p>
      <div className="form-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={index + 1}>
        <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
      </div>
    </div>
  );
  const logo = def.theme.logoUrl && /^https:\/\//.test(def.theme.logoUrl) && showHeader && chrome !== "microsoft" && (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={def.theme.logoUrl} alt="" className="form-cover-logo" />
  );
  const submitForm = (e: React.FormEvent) => { e.preventDefault(); flow.submit(); };

  if (chrome === "microsoft") {
    return (
      <div ref={topRef} className="form-page-body form-page-body--chrome" data-chrome="microsoft">
        <div className="form-layout-flat">
          {header}
          <form noValidate onSubmit={submitForm} className="form-column">{progress}{questions}</form>
        </div>
      </div>
    );
  }
  if (chrome === "google" || chrome === "apple") {
    return (
      <div ref={topRef} className="form-page-body form-page-body--chrome" data-chrome={chrome}>
        <div className="form-layout-flat">
          {logo}
          {header}
          {progress}
          <form noValidate onSubmit={submitForm}>{questions}</form>
        </div>
      </div>
    );
  }
  return (
    <div ref={topRef} className="form-page-body">
      <div className={`form-layout-${layout}`}>
        {logo}
        {header}
        {progress}
        <form noValidate onSubmit={submitForm} className="space-y-9">{questions}</form>
      </div>
    </div>
  );
}

// ── Typeform style: one question at a time ───────────────────────────────
/** A ref that always holds the latest value, for listeners and timers registered once. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => { ref.current = value; });
  return ref;
}

/** Focus only within the participating renderer; hidden swipe cards stay inert. */
function focusField(root: HTMLElement | null, fieldId: string) {
  const target = Array.from(root?.querySelectorAll<HTMLElement>("[data-field-id]") ?? [])
    .find((el) => el.dataset.fieldId === fieldId && !el.closest("[inert]"));
  target?.focus({ preventScroll: true });
}

function useStepFocus(rootRef: React.RefObject<HTMLDivElement | null>, key: string | undefined) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || (document.activeElement !== document.body && !root.contains(document.activeElement))) return;
    const step = root.querySelector<HTMLElement>("[data-step-focus]:not([inert])");
    const field = step?.querySelector<HTMLElement>("[data-field-id]:not(:disabled)");
    (field ?? step)?.focus({ preventScroll: true });
  }, [rootRef, key]);
}

function useAutoAdvance(flow: Flow) {
  const flowRef = useLatest(flow);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (timer.current) clearTimeout(timer.current); }, [flow.step?.key]);
  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const { step, navigationRevision, last } = flowRef.current;
    if (last) return;
    const version = navigationRevision();
    timer.current = setTimeout(() => {
      const current = flowRef.current;
      if (!current.last && current.step?.key === step?.key && current.navigationRevision() === version) current.advance();
    }, 520);
  }, [flowRef]);
}

function useStepKeys(flow: Flow, stageRef: React.RefObject<HTMLDivElement | null>, extra?: (e: KeyboardEvent) => boolean) {
  const flowRef = useLatest(flow);
  const extraRef = useLatest(extra);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.defaultPrevented || e.isComposing || e.repeat || e.altKey || !stageRef.current) return;
      if (!stageRef.current.contains(target) || target.closest("[inert]")) return;
      const typing = !!target.closest("input:not([type=radio]):not([type=checkbox]), textarea, select, [contenteditable]:not([contenteditable=false])");
      const f = flowRef.current;
      const field = f.step?.fields[0];
      if (!field || e.ctrlKey || e.metaKey) {
        // Ctrl+Enter is an explicit press of the primary button, including Submit.
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); f.submit(); }
        return;
      }
      if (typing) return;
      if (extraRef.current?.(e)) return;
      const letter = e.key.length === 1 ? e.key.toUpperCase().charCodeAt(0) - 65 : -1;
      if ((field.type === "choice" || field.type === "multi_choice") && letter >= 0 && letter < (field.options?.length ?? 0)) {
        e.preventDefault();
        Array.from(stageRef.current.querySelectorAll<HTMLInputElement>("[data-choice-index]")).find((el) => el.dataset.choiceIndex === `${field.id}-${letter}` && !el.closest("[inert]"))?.click();
        return;
      }
      if ((field.type === "rating" || field.type === "scale") && /^[0-9]$/.test(e.key)) {
        const input = Array.from(stageRef.current.querySelectorAll<HTMLInputElement>("[data-scale-value]")).find((el) => el.dataset.scaleValue === `${field.id}-${e.key}` && !el.closest("[inert]"));
        if (input) { e.preventDefault(); input.click(); }
        return;
      }
      if (e.key === "Enter" && !target.closest("button, a")) { e.preventDefault(); f.advance(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stageRef, flowRef, extraRef]);
}

type Place = { top: number; left: number; width: number };

/**
 * Typeform's transition is one continuous scroll: the answered question moves
 * up and out while the next rises into place. The previous step stays on
 * screen for the length of the motion, pinned exactly where it was.
 */
function useLeavingStep(step: Step | undefined, direction: number, stepRef: React.RefObject<HTMLDivElement | null>) {
  const [leaving, setLeaving] = useState<{ step: Step; direction: number; place: Place } | null>(null);
  const previous = useRef(step);
  const place = useRef<Place | null>(null);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = step;
    if (!before || before.key === step?.key || !place.current || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setLeaving({ step: before, direction, place: place.current });
    const timer = setTimeout(() => setLeaving(null), 560);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.key]);
  // Layout position (not transformed), measured after every commit for the next change.
  useLayoutEffect(() => {
    const el = stepRef.current;
    if (el) place.current = { top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth };
  });
  return leaving;
}

function FocusFlow({ flow, props }: { flow: Flow; props: FormRendererProps }) {
  const { def, t, language, answers, steps, step, index, last, direction } = flow;
  const stageRef = useRef<HTMLDivElement>(null);
  useStepFocus(stageRef, flow.step?.key);
  const stepRef = useRef<HTMLDivElement>(null);
  const leaving = useLeavingStep(step, direction, stepRef);
  const leavingField = leaving?.step.fields[0];
  const numberOf = (f: FormField) => def.fields.filter((x) => isAnswerable(x)).findIndex((x) => x.id === f.id) + 1;
  const autoAdvance = useAutoAdvance(flow);
  useStepKeys(flow, stageRef);
  const field = step?.fields[0];
  const number = field ? numberOf(field) : 0;

  return (
    <div ref={stageRef} className="form-stage form-focus">
      <div className="form-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={index + 1} aria-label={t.of(index + 1, steps.length)}>
        <span style={{ width: `${((index + (last ? 1 : 0)) / Math.max(1, steps.length)) * 100}%` }} />
      </div>
      {leaving && leavingField && (
        <div key={`leave-${leaving.step.key}`} className={`form-step-leave ${leaving.direction > 0 ? "" : "form-step-leave--down"}`} aria-hidden="true" inert
          style={{ top: leaving.place.top, left: leaving.place.left, width: leaving.place.width }}>
          <div className="form-focus-question">
            {isAnswerable(leavingField) && numberOf(leavingField) > 0 && <span className="form-focus-num">{numberOf(leavingField)}<span>{isRtl(language) ? "←" : "→"}</span></span>}
            <div className="flex-1 min-w-0">
              <FieldView field={localizeField(leavingField, language, def)} def={def} language={language} answers={answers} error={null}
                onChange={() => {}} files={props.files} play={flow.play} variant="focus" />
              <div className="form-focus-actions"><span className="form-btn">{t.ok} <Check size={16} aria-hidden="true" /></span></div>
            </div>
          </div>
        </div>
      )}
      <form noValidate onSubmit={(e) => { e.preventDefault(); flow.submit(); }} className="form-focus-inner">
        {field && (
          <div ref={stepRef} key={step.key} data-step-focus tabIndex={-1} aria-label={field.label} className={`form-step--${direction > 0 ? "fwd" : "back"}`}>
            <div className="form-focus-question">
              {isAnswerable(field) && number > 0 && (
                <span className="form-focus-num" aria-hidden="true">{number}<span>{isRtl(language) ? "←" : "→"}</span></span>
              )}
              <div className="flex-1 min-w-0">
                <FieldView field={localizeField(field, language, def)} def={def} language={language} answers={answers}
                  error={flow.showErrors || props.serverErrors?.[field.id] ? flow.errorFor(field) : null}
                  onChange={(v) => flow.setAnswer(field, v)} uploadFile={props.uploadFile} files={props.files} play={flow.play}
                  variant="focus" onEnter={flow.submit} onCommit={autoAdvanceTypes.includes(field.type) ? autoAdvance : undefined} />
                <div key={flow.shake} className={`form-focus-actions ${flow.shake ? "form-shake" : ""}`}>
                  <button type="submit" disabled={props.submitting} className="form-btn">
                    {last ? (props.submitting ? <span className="form-spinner" aria-label="…" /> : props.submitLabel ?? t.submit) : t.ok}
                    {!last && <Check size={16} aria-hidden="true" />}
                  </button>
                  <span className="form-hint" aria-hidden="true">{t.pressEnter} <kbd><CornerDownLeft size={11} /></kbd></span>
                </div>
                {last && props.footer && <div className="mt-8">{props.footer}</div>}
              </div>
            </div>
          </div>
        )}
      </form>
      <div className="form-stage-nav" role="group" aria-label={t.of(index + 1, steps.length)}>
        <button type="button" onClick={flow.back} disabled={index === 0} aria-label={t.back}><ChevronUp size={18} /></button>
        <button type="button" onClick={flow.advance} disabled={last} aria-label={t.next}><ChevronDown size={18} /></button>
      </div>
    </div>
  );
}

// ── Swipe: full-screen cards ──────────────────────────────────────────────
function SwipeFlow({ flow, props }: { flow: Flow; props: FormRendererProps }) {
  const { def, t, language, answers, steps, index, last } = flow;
  const stageRef = useRef<HTMLDivElement>(null);
  useStepFocus(stageRef, flow.step?.key);
  const autoAdvance = useAutoAdvance(flow);
  const [drag, setDrag] = useState(0);
  const touch = useRef<{ y: number; x: number; scroller: HTMLElement | null } | null>(null);
  const wheelLock = useRef(0);
  const flowRef = useLatest(flow);

  useStepKeys(flow, stageRef, (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, button, a, [contenteditable]:not([contenteditable=false])")) return false;
    if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); flowRef.current.advance(); return true; }
    if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); flowRef.current.back(); return true; }
    return false;
  });

  const atEdge = (el: HTMLElement | null, down: boolean) => {
    if (!el) return true;
    return down ? el.scrollTop + el.clientHeight >= el.scrollHeight - 2 : el.scrollTop <= 1;
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      const scroller = (e.target as HTMLElement).closest<HTMLElement>(".form-swipe-scroll");
      const down = e.deltaY > 0;
      if (!atEdge(scroller, down)) return;
      e.preventDefault();
      const now = Date.now();
      if (now < wheelLock.current || Math.abs(e.deltaY) < 12) return;
      wheelLock.current = now + 750;
      if (down) flowRef.current.advance(); else flowRef.current.back();
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [flowRef]);

  const onTouchStart = (e: React.TouchEvent) => {
    const scroller = (e.target as HTMLElement).closest<HTMLElement>(".form-swipe-scroll");
    touch.current = { y: e.touches[0].clientY, x: e.touches[0].clientX, scroller };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dy = e.touches[0].clientY - touch.current.y;
    const dx = e.touches[0].clientX - touch.current.x;
    if (Math.abs(dx) > Math.abs(dy) || !atEdge(touch.current.scroller, dy < 0)) return;
    const resist = (dy < 0 && last) || (dy > 0 && index === 0) ? 0.25 : 0.55;
    setDrag(dy * resist);
  };
  const onTouchEnd = () => {
    const distance = drag;
    touch.current = null;
    setDrag(0);
    if (distance < -45) flow.advance();
    else if (distance > 45) flow.back();
  };

  const visibleCards = steps.map((s, i) => ({ s, i })).filter(({ i }) => Math.abs(i - index) <= 1);

  return (
    <div ref={stageRef} className="form-stage form-swipe" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={() => { touch.current = null; setDrag(0); }}>
      {visibleCards.map(({ s, i }) => {
        const field = s.fields[0];
        const offset = i - index;
        const current = offset === 0;
        return (
          <section key={s.key} data-step-focus tabIndex={-1} aria-label={field?.label} className={`form-swipe-card ${drag ? "is-dragging" : ""}`} data-tone={i % 4} aria-hidden={!current} inert={!current}
            style={{ transform: `translate3d(0, calc(${offset * 100}% + ${drag}px), 0) scale(${current ? 1 : 0.94})`, opacity: current ? 1 : 0.5 }}>
            <div className="form-swipe-scroll">
              <form noValidate onSubmit={(e) => { e.preventDefault(); flow.submit(); }} className="form-swipe-inner">
                <p className="form-swipe-count" aria-hidden="true">{t.of(i + 1, steps.length)}</p>
                {field && (
                  <FieldView field={localizeField(field, language, def)} def={def} language={language} answers={answers}
                    error={current && (flow.showErrors || props.serverErrors?.[field.id]) ? flow.errorFor(field) : null}
                    onChange={(v) => flow.setAnswer(field, v)} uploadFile={props.uploadFile} files={props.files} play={flow.play}
                    variant="swipe" autoFocus={false} onEnter={flow.submit} onCommit={autoAdvanceTypes.includes(field.type) ? autoAdvance : undefined} />
                )}
                <div key={current ? flow.shake : 0} className={`form-swipe-actions ${current && flow.shake ? "form-shake" : ""}`}>
                  <button type="submit" disabled={props.submitting} className="form-btn form-btn-lg">
                    {i === steps.length - 1 ? (props.submitting ? <span className="form-spinner" aria-label="…" /> : props.submitLabel ?? t.submit) : t.next}
                  </button>
                </div>
                {i === steps.length - 1 && props.footer && <div className="mt-6">{props.footer}</div>}
              </form>
            </div>
          </section>
        );
      })}
      <div className="form-swipe-rail" aria-hidden="true">
        {steps.length <= 14 ? steps.map((s, i) => <span key={s.key} className={`form-swipe-dot ${i === index ? "is-active" : i < index ? "is-done" : ""}`} />) : (
          <span className="form-swipe-fraction">{index + 1}<small>/{steps.length}</small></span>
        )}
      </div>
      {index === 0 && !last && (
        <button type="button" className="form-swipe-hint" onClick={flow.advance}>
          <ChevronUp size={18} aria-hidden="true" /> {t.swipe}
        </button>
      )}
      <div className="form-stage-nav" role="group" aria-label={t.of(index + 1, steps.length)}>
        <button type="button" onClick={flow.back} disabled={index === 0} aria-label={t.back}><ChevronUp size={18} /></button>
        <button type="button" onClick={flow.advance} disabled={last} aria-label={t.next}><ChevronDown size={18} /></button>
      </div>
    </div>
  );
}

// ── Ending ────────────────────────────────────────────────────────────────
export function EndingView({ ending, def, language, answers, children, score }: {
  ending: Ending | null; def: FormDefinition; language: Language; answers: Answers; children?: React.ReactNode;
  score?: { value: number; max: number } | null;
}) {
  const localized = ending ? localizeEnding(ending, language, def) : null;
  const fallback = language === "ar" ? { title: "شكرًا لك", message: "تم استلام إجابتك." } : { title: "Thank you", message: "Your response was received." };
  const immersive = def.presentation === "conversational" || def.presentation === "swipe";
  const [shown, setShown] = useState(0);
  const pack = themeSound(def);

  useEffect(() => {
    sfx.play("finish", pack);
    haptics.success();
    if (!score || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(score?.value ?? 0);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - began) / 1100);
      setShown(Math.round(score.value * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    if (score.max > 0 && score.value / score.max >= 0.5) {
      const accent = getComputedStyle(document.querySelector(".form-theme, .form-legacy") ?? document.body).getPropertyValue("--form-accent").trim() || "#3595e3";
      void import("canvas-confetti").then(({ default: confetti }) => confetti({ particleCount: 110, spread: 75, origin: { y: 0.65 }, colors: [accent, "#ffffff", "#ffd54f"], disableForReducedMotion: true }));
    }
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- celebrate once
  }, []);

  const pct = score && score.max > 0 ? score.value / score.max : 0;
  return (
    <div dir={isRtl(language) ? "rtl" : "ltr"} lang={language} className={`form-ending ${immersive ? "form-ending--stage" : ""}`} role="status">
      <div className="form-ending-inner form-stagger">
        {score ? (
          <div className="form-score" style={{ ["--i" as string]: 0, ["--pct" as string]: pct }}>
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="52" className="form-score-track" />
              <circle cx="60" cy="60" r="52" className="form-score-fill" pathLength={100} />
            </svg>
            <div className="form-score-value">
              <strong>{shown}</strong><span>/ {score.max}</span>
            </div>
            <p className="sr-only">{ui[language].score}: {score.value} / {score.max}</p>
          </div>
        ) : (
          <svg className="form-ending-check" viewBox="0 0 52 52" aria-hidden="true" style={{ ["--i" as string]: 0 }}>
            <circle cx="26" cy="26" r="24" />
            <path d="M15 27 l7 7 l15 -16" />
          </svg>
        )}
        <h1 className="form-page-title form-heading" style={{ ["--i" as string]: 1 }}>{pipeText(localized?.title || fallback.title, def, answers, language)}</h1>
        <p className="whitespace-pre-line form-muted text-lg" style={{ ["--i" as string]: 2 }}>{pipeText(localized?.message || fallback.message, def, answers, language)}</p>
        <div className="space-y-4" style={{ ["--i" as string]: 3 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Fields ────────────────────────────────────────────────────────────────
interface FieldViewProps {
  field: FormField;
  def: FormDefinition;
  language: Language;
  answers: Answers;
  error: string | null;
  onChange: (value: AnswerValue | undefined) => void;
  uploadFile?: FormRendererProps["uploadFile"];
  files?: Record<string, UploadedFile>;
  autoFocus?: boolean;
  onEnter?: () => void;
  /** A complete single answer was chosen (immersive modes advance). */
  onCommit?: () => void;
  play: (name: SfxName) => void;
  variant: "page" | "focus" | "swipe";
}

function FieldView({ field, def, language, answers, error, onChange, uploadFile, files, autoFocus, onEnter, onCommit, play, variant }: FieldViewProps) {
  const id = useId();
  const t = ui[language];
  const value = answers[field.id];
  const label = pipeText(field.label, def, answers, language);
  const description = field.description ? pipeText(field.description, def, answers, language) : "";
  const describedBy = [description ? `desc-${id}` : "", error ? `err-${id}` : ""].filter(Boolean).join(" ") || undefined;
  const immersive = variant !== "page";
  const [blink, setBlink] = useState<string | null>(null);
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (blinkTimer.current) clearTimeout(blinkTimer.current); }, []);
  const inputClass = `form-input ${immersive ? "form-input--line" : ""}`;

  if (field.type === "section") return <h2 className="text-2xl font-bold form-heading form-section-title">{label}</h2>;
  if (field.type === "statement") {
    return (
      <div className="space-y-3">
        {label && <p className={`form-q-label form-heading ${immersive ? "" : "text-lg"}`}>{label}</p>}
        {description && <p className="whitespace-pre-line form-muted">{description}</p>}
        <FieldImage field={field} />
      </div>
    );
  }

  const heading = (
    <>
      <span className="form-q-label form-heading">{label}{field.required && <span aria-hidden="true" className="form-required"> *</span>}</span>
      {field.required && <span className="sr-only"> ({t.required})</span>}
    </>
  );
  const help = (
    <>
      {description && <p id={`desc-${id}`} className="form-muted whitespace-pre-line form-q-description">{description}</p>}
      <FieldImage field={field} />
    </>
  );
  const errorText = error && <p id={`err-${id}`} className="form-error-text" role="alert"><X size={14} aria-hidden="true" /> {error}</p>;
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (onEnter && !e.nativeEvent.isComposing && !e.repeat && e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); e.stopPropagation(); onEnter(); }
  };
  const commit = (next: AnswerValue | undefined) => {
    onChange(next);
    if (next !== undefined) onCommit?.();
  };

  const textTypes: Partial<Record<FormField["type"], string>> = { text: "text", email: "email", phone: "tel", url: "url", date: "date", time: "time" };
  if (textTypes[field.type]) {
    return (
      <div className="form-field">
        <label htmlFor={`field-${id}`} className="block">{heading}</label>
        {help}
        <input id={`field-${id}`} data-field-id={field.id} type={textTypes[field.type]} value={typeof value === "string" ? value : ""} placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value || undefined)} aria-invalid={!!error} aria-describedby={describedBy} aria-required={field.required}
          autoComplete={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "off"} dir={["email", "url", "phone", "date", "time"].includes(field.type) ? "ltr" : undefined}
          min={field.type === "date" || field.type === "time" ? field.minValue : undefined} max={field.type === "date" || field.type === "time" ? field.maxValue : undefined}
          className={inputClass} autoFocus={autoFocus} onKeyDown={onKeyDown} maxLength={1000} />
        {errorText}
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <div className="form-field">
        <label htmlFor={`field-${id}`} className="block">{heading}</label>
        {help}
        <textarea id={`field-${id}`} data-field-id={field.id} value={typeof value === "string" ? value : ""} placeholder={field.placeholder} rows={immersive ? 3 : 5} maxLength={10000}
          onChange={(e) => onChange(e.target.value || undefined)} aria-invalid={!!error} aria-describedby={describedBy} aria-required={field.required}
          className={inputClass} autoFocus={autoFocus}
          onKeyDown={(e) => { if (onEnter && !e.nativeEvent.isComposing && !e.repeat && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); onEnter(); } }} />
        {immersive && <p className="form-hint" aria-hidden="true"><kbd>Ctrl</kbd> + <kbd>Enter ↵</kbd></p>}
        {errorText}
      </div>
    );
  }
  if (field.type === "number") {
    return (
      <div className="form-field">
        <label htmlFor={`field-${id}`} className="block">{heading}</label>
        {help}
        <NumberInput id={`field-${id}`} fieldId={field.id} field={field} value={value} onChange={onChange} invalid={!!error} describedBy={describedBy}
          className={inputClass} autoFocus={autoFocus} onKeyDown={onKeyDown} />
        {errorText}
      </div>
    );
  }
  if (field.type === "dropdown") {
    return (
      <div className="form-field">
        <label htmlFor={`field-${id}`} className="block">{heading}</label>
        {help}
        <div className="form-select">
          <ChaosSelect id={`field-${id}`} data-field-id={field.id} value={typeof value === "string" ? value : ""} onChange={(e) => { play("select"); commit(e.target.value || undefined); }}
            aria-invalid={!!error} aria-describedby={describedBy} className={`form-input ${immersive ? "form-input--lg" : ""}`} autoFocus={autoFocus}>
            <option value="">{t.choose}</option>
            {field.options?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </ChaosSelect>
        </div>
        {errorText}
      </div>
    );
  }
  if (field.type === "choice" || field.type === "multi_choice") {
    const multiple = field.type === "multi_choice";
    const selected = multiple ? (Array.isArray(value) ? value : []) : typeof value === "string" ? [value] : [];
    return (
      <fieldset className="form-field" aria-describedby={describedBy} aria-invalid={!!error} id={`field-${id}`} data-field-id={field.id} tabIndex={-1}>
        <legend className="mb-1">{heading}</legend>
        {help}
        {multiple && immersive && <p className="form-hint">{t.chooseMany}</p>}
        <div className={`form-choices ${immersive ? "form-choices--immersive" : ""}`}>
          {field.options?.map((o, i) => {
            const checked = selected.includes(o.id);
            return (
              <label key={o.id} className={`form-choice ${blink === o.id ? "form-choice--blink" : ""}`} data-checked={checked}>
                <input type={multiple ? "checkbox" : "radio"} name={id} checked={checked} autoFocus={autoFocus && i === 0 && variant === "page"} className="sr-only"
                  data-choice-index={`${field.id}-${i}`}
                  onChange={() => {
                    haptics.select();
                    if (!multiple) {
                      play("select");
                      // Typeform's confirming double blink before moving on.
                      if (immersive) {
                        setBlink(o.id);
                        if (blinkTimer.current) clearTimeout(blinkTimer.current);
                        blinkTimer.current = setTimeout(() => setBlink(null), 460);
                      }
                      return commit(o.id);
                    }
                    play(checked ? "deselect" : "select");
                    const next = checked ? selected.filter((id) => id !== o.id) : [...selected, o.id];
                    onChange(next.length ? next : undefined);
                  }} />
                {immersive
                  ? <span className="form-choice-key" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
                  : <span className={`form-choice-mark ${multiple ? "form-choice-mark--box" : ""}`} aria-hidden="true"><Check size={12} strokeWidth={3} /></span>}
                <span className="flex-1">{o.label}</span>
                {immersive && checked && <Check size={18} className="form-choice-tick" aria-hidden="true" />}
              </label>
            );
          })}
        </div>
        {errorText}
      </fieldset>
    );
  }
  if (field.type === "rating" || field.type === "scale") {
    const lo = field.type === "rating" ? 1 : field.min ?? 1;
    const hi = field.max ?? 5;
    const stepBy = field.type === "scale" ? field.step ?? 1 : 1;
    const values = Array.from({ length: Math.floor((hi - lo) / stepBy) + 1 }, (_, i) => lo + i * stepBy);
    const current = typeof value === "number" ? value : null;
    return (
      <fieldset className="form-field" aria-describedby={describedBy} id={`field-${id}`} data-field-id={field.id} tabIndex={-1}>
        <legend className="mb-1">{heading}</legend>
        {help}
        <div className={field.type === "rating" ? "form-stars" : "form-scale"} role="radiogroup" aria-label={field.label}>
          {values.map((n) => {
            const checked = current === n;
            const filled = field.type === "rating" && current !== null && n <= current;
            return (
              <label key={n} className={field.type === "rating" ? "form-star" : "form-scale-cell"} data-checked={checked} data-filled={filled}>
                <input type="radio" className="sr-only" name={id} checked={checked} data-scale-value={`${field.id}-${n}`}
                  onChange={() => { play("select"); haptics.select(); commit(n); }} aria-label={field.type === "rating" ? `${n} / ${hi}` : t.scaleValue(n, lo, hi)} />
                {field.type === "rating" ? <Star size={30} aria-hidden="true" /> : n}
              </label>
            );
          })}
        </div>
        {(field.minLabel || field.maxLabel) && (
          <div className="flex justify-between text-sm form-muted"><span>{field.minLabel}</span><span>{field.maxLabel}</span></div>
        )}
        {current !== null && !field.required && (
          <button type="button" className="form-btn form-btn-ghost form-btn-sm" data-clear-answer={field.id} aria-label={t.clearRating(field.label || field.id)} onClick={() => { play("deselect"); onChange(undefined); }}>
            <X size={14} aria-hidden="true" /> {t.clearAnswer}
          </button>
        )}
        {errorText}
      </fieldset>
    );
  }
  if (field.type === "ranking") {
    const order = Array.isArray(value) && value.length === field.options?.length ? value : (field.options ?? []).map((o) => o.id);
    const labelFor = (id: string) => field.options?.find((o) => o.id === id)?.label ?? id;
    const move = (index: number, delta: number) => {
      const next = [...order];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      play("tap");
      onChange(next);
    };
    return (
      <fieldset className="form-field" aria-describedby={describedBy} id={`field-${id}`} data-field-id={field.id} tabIndex={-1}>
        <legend className="mb-1">{heading}</legend>
        {help}
        <ol className="space-y-2">
          {order.map((id, i) => (
            <li key={id} className="form-choice form-rank-item">
              <span className="form-choice-key" aria-hidden="true">{i + 1}</span>
              <span className="flex-1">{labelFor(id)}</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${t.moveUp}: ${labelFor(id)}`} className="form-icon-btn"><ArrowUp size={16} /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`${t.moveDown}: ${labelFor(id)}`} className="form-icon-btn"><ArrowDown size={16} /></button>
            </li>
          ))}
        </ol>
        {!Array.isArray(value) && <button type="button" onClick={() => onChange(order)} className="form-btn form-btn-ghost form-btn-sm">{t.keepOrder}</button>}
        {errorText}
      </fieldset>
    );
  }
  if (field.type === "matrix") {
    const current = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return (
      <fieldset className="form-field" aria-describedby={describedBy} id={`field-${id}`} data-field-id={field.id} tabIndex={-1}>
        <legend className="mb-1">{heading}</legend>
        {help}
        <div className="overflow-x-auto form-matrix">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <td />
                {field.options?.map((o) => <th key={o.id} scope="col" className="p-2 text-xs font-medium text-center form-muted">{o.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {field.rows?.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="p-2 text-start font-medium">{r.label}</th>
                  {field.options?.map((o) => (
                    <td key={o.id} className="p-2 text-center">
                      <input type="radio" name={`${id}-${r.id}`} checked={current[r.id] === o.id} aria-label={`${r.label}: ${o.label}`}
                        onChange={() => { play("select"); onChange({ ...current, [r.id]: o.id }); }} className="form-radio" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {errorText}
      </fieldset>
    );
  }
  if (field.type === "file") {
    return <FileField id={id} field={field} heading={heading} help={help} errorText={errorText} value={value} onChange={onChange} uploadFile={uploadFile} files={files} language={language} />;
  }
  return null;
}

function FieldImage({ field }: { field: FormField }) {
  if (!field.image || !/^https:\/\//.test(field.image.url)) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={field.image.url} alt={field.image.alt} className="form-image" loading="lazy" />;
}

function FileField({ id, field, heading, help, errorText, value, onChange, uploadFile, files, language }: {
  id: string; field: FormField; heading: React.ReactNode; help: React.ReactNode; errorText: React.ReactNode; value: AnswerValue | undefined;
  onChange: (v: AnswerValue | undefined) => void; uploadFile?: FormRendererProps["uploadFile"]; files?: Record<string, UploadedFile>; language: Language;
}) {
  const t = ui[language];
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const ids = Array.isArray(value) ? value : [];
  const max = field.max ?? 1;
  return (
    <div className="form-field">
      <label htmlFor={`field-${id}`} className="block">{heading}</label>
      {help}
      {ids.length > 0 && (
        <ul className="space-y-1">
          {ids.map((id) => (
            <li key={id} className="form-choice" data-checked="true">
              <Check size={16} aria-hidden="true" />
              <span className="flex-1 truncate">{files?.[id]?.name ?? id}</span>
              <button type="button" className="form-icon-btn" onClick={() => onChange(ids.filter((x) => x !== id).length ? ids.filter((x) => x !== id) : undefined)} aria-label={`${t.remove} ${files?.[id]?.name ?? ""}`}><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      {ids.length < max && (
        <label className={`form-drop ${!uploadFile ? "opacity-50" : ""}`}>
          {busy ? <span className="form-spinner" aria-hidden="true" /> : <Upload size={20} aria-hidden="true" />}
          <span className="font-semibold">{busy ? t.uploading : t.upload}</span>
          <span className="text-xs form-muted">{t.fileHint}</span>
          <input id={`field-${id}`} data-field-id={field.id} type="file" className="sr-only" disabled={!uploadFile || busy}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.docx,.xlsx"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || !uploadFile) return;
              setProblem("");
              setBusy(true);
              try {
                const uploaded = await uploadFile(field, file);
                onChange([...ids, uploaded.uploadId]);
              } catch (err) {
                setProblem(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }} />
        </label>
      )}
      {problem && <p className="form-error-text" role="alert">{problem}</p>}
      {errorText}
    </div>
  );
}

/** In-app replacement for window.confirm: focus is trapped, Escape cancels, focus returns to the Clear button. */
function ClearDialog({ message, clearLabel, cancelLabel, onCancel, onClear }: { message: string; clearLabel: string; cancelLabel: string; onCancel: () => void; onClear: () => void }) {
  const panel = useModal({ onClose: onCancel });
  const id = useId();
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", background: "rgba(0,0,0,.5)", padding: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div ref={panel} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby={id} style={{ background: "var(--form-bg, #fff)", color: "var(--form-fg, #111)", borderRadius: 12, padding: 20, maxWidth: 420, width: "100%" }}>
        <p id={id} style={{ marginBottom: 16 }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="form-btn form-btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="form-btn" onClick={onClear}>{clearLabel}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Number field. People type text, which is parsed the same way everywhere:
 * Western or Arabic-Indic digits, "." or a decimal comma. The stored answer is
 * a plain number; text that is not a number is kept (as text) so the field
 * shows "Enter a number." instead of silently turning into 0 or vanishing.
 */
function NumberInput({ id, fieldId, field, value, onChange, invalid, describedBy, className, autoFocus, onKeyDown }: {
  id: string; fieldId: string; field: FormField; value: AnswerValue | undefined; onChange: (next: AnswerValue | undefined) => void;
  invalid: boolean; describedBy?: string; className: string; autoFocus?: boolean; onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (typeof value === "number" ? String(value) : typeof value === "string" ? value : "");
  const hint = [field.min !== undefined ? `min ${field.min}` : "", field.max !== undefined ? `max ${field.max}` : "", field.step !== undefined ? `step ${field.step}` : ""].filter(Boolean).join(" · ");
  return (
    <input id={id} data-field-id={fieldId} type="text" inputMode={field.integer ? "numeric" : "decimal"} dir="ltr" value={shown} autoComplete="off"
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const parsed = parseNumberInput(text);
        onChange(parsed === undefined ? undefined : parsed === null ? text : parsed);
      }}
      onBlur={() => setDraft(null)}
      aria-invalid={invalid} aria-describedby={describedBy} aria-required={field.required} title={hint || undefined}
      className={className} autoFocus={autoFocus} onKeyDown={onKeyDown} />
  );
}
