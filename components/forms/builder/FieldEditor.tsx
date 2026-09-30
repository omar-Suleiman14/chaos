"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Copy, GitBranch, Plus, Trash2, X } from "lucide-react";
import { blankField, fieldTypes, isAnswerable, newId, optionTypes } from "@/convex/formLogic";
import type { Choice, FieldType, FormDefinition, FormField } from "@/convex/formLogic";
import { optionsFromText } from "@/lib/formBuilder";
import { WsMenu, WsSwitch } from "@/components/workspace/primitives";
import { useBuilderLabels } from "@/components/forms/formThemeLabels";
import { useCopy } from "@/lib/i18n";
import RuleEditor from "./RuleEditor";
import { Select } from "@/components/workspace/Select";

/** Change type, keeping the label, description, logic and any options that still apply. */
export function convertField(field: FormField, type: FieldType): FormField {
  if (field.type === type) return field;
  const fresh = blankField(type);
  const next: FormField = { ...fresh, id: field.id, label: field.label, description: field.description, required: isAnswerable(fresh) ? field.required : false, showIf: field.showIf, translations: field.translations, image: field.image };
  if (optionTypes.includes(type) && field.options?.length) next.options = field.options;
  if (!next.showIf) delete next.showIf;
  if (!next.translations) delete next.translations;
  if (!next.image) delete next.image;
  if (!next.description) delete next.description;
  return next;
}

const copy = {
  en: {
    options: "Options", rows: "Rows", columns: "Columns", apply: "Apply", editAsText: "Edit as text",
    onePerLine: (label: string) => `${label}, one per line`, itemN: (label: string, n: number) => `${label} ${n}`,
    score: "Score", scoreFor: (label: string) => `Score for ${label}`, moveUp: "Move up", moveDown: "Move down",
    remove: (label: string) => `Remove ${label}`, option: "option", newItem: (kind: string, n: number) => `${{ options: "Option", rows: "Row", columns: "Column" }[kind]} ${n}`,
    addItem: (kind: string): string => (kind === "options" ? "Add an option" : kind === "rows" ? "Add row" : "Add column"),
    sectionTitle: "Section title", heading: "Heading", question: "Question", headingOptional: "Heading (optional)", typeQuestion: "Type your question",
    text: "Text", description: "Description", descriptionOptional: "Description (optional)", addDescription: "Add a description",
    answerKey: "Answer key", correct: "Correct answer", onlyYou: "Only you can see it before people submit.", untitledOption: "Untitled option",
    pointsAndExplanation: "Points and explanation", points: "Points", explanation: "Explanation after submission (optional)",
    stars: "Stars", from: "From", to: "To", lowLabel: "Low label", highLabel: "High label", scaleStep: "Step",
    step: "Step", stepHelp: "Answers must be a multiple of this, counting from the minimum (or 0).", wholeNumbers: "Whole numbers only",

    earliestDate: "Earliest date", latestDate: "Latest date", earliestTime: "Earliest time", latestTime: "Latest time",

    emailNote: "Email addresses aren’t verified.",
    ratingNote: "People can clear an optional rating after choosing one.",
    moreOptions: "More options", questionType: "Question type",
    giveScores: "Give options scores (for calculated results and endings)", minSel: "Minimum selections", maxSel: "Maximum selections",
    minChars: "Min characters", maxChars: "Max characters", placeholder: "Placeholder", minimum: "Minimum", maximum: "Maximum",
    filesAllowed: "Files allowed (1–5)", fileNote: "PDF, images, text, Word or Excel, up to 10 MB.",
    imageAddress: "Image address", imageDescription: "Image description", imageAltHint: "For people who cannot see it",
    tipBefore: "Tip: insert an earlier answer with ", tipMid: " (this one is ", tipAfter: ") or the score with ", tipEnd: ".",
    required: "Required", shownConditionally: "Shown conditionally", logic: "Logic",
    actionsFor: (name: string) => `Actions for ${name}`, duplicateSection: "Duplicate section", duplicate: "Duplicate",
    removeSectionHeading: "Remove section heading", delete: "Delete", showSectionIf: "Show this section if", showQuestionIf: "Show this question if",
  },
  ar: {
    options: "الخيارات", rows: "الصفوف", columns: "الأعمدة", apply: "طبّق", editAsText: "حرّر كنص",
    onePerLine: (label: string) => `${label}، واحد في كل سطر`, itemN: (label: string, n: number) => `${label} ${n}`,
    score: "الدرجة", scoreFor: (label: string) => `درجة ${label}`, moveUp: "انقل لأعلى", moveDown: "انقل لأسفل",
    remove: (label: string) => `احذف ${label}`, option: "خيار", newItem: (kind: string, n: number) => `${{ options: "خيار", rows: "صف", columns: "عمود" }[kind]} ${n}`,
    addItem: (kind: string): string => (kind === "options" ? "أضف خيارًا" : kind === "rows" ? "أضف صفًا" : "أضف عمودًا"),
    sectionTitle: "عنوان القسم", heading: "العنوان", question: "السؤال", headingOptional: "العنوان (اختياري)", typeQuestion: "اكتب سؤالك",
    text: "النص", description: "الوصف", descriptionOptional: "الوصف (اختياري)", addDescription: "أضف وصفًا",
    answerKey: "مفتاح الإجابة", correct: "الإجابة الصحيحة", onlyYou: "لا يراها غيرك قبل أن يرسل المجيبون ردودهم.", untitledOption: "خيار بلا عنوان",
    pointsAndExplanation: "النقاط والشرح", points: "النقاط", explanation: "شرح يظهر بعد الإرسال (اختياري)",
    stars: "النجوم", from: "من", to: "إلى", lowLabel: "تسمية الحد الأدنى", highLabel: "تسمية الحد الأقصى", scaleStep: "الخطوة",
    step: "الخطوة", stepHelp: "يجب أن تكون الإجابة من مضاعفات هذه القيمة بدءًا من الحد الأدنى (أو 0).", wholeNumbers: "أعداد صحيحة فقط",

    earliestDate: "أبكر تاريخ", latestDate: "آخر تاريخ", earliestTime: "أبكر وقت", latestTime: "آخر وقت",

    emailNote: "لا يُتحقق من عناوين البريد.",
    ratingNote: "يستطيع المجيب مسح التقييم الاختياري بعد اختياره.",
    moreOptions: "خيارات أخرى", questionType: "نوع السؤال",
    giveScores: "أعطِ الخيارات درجات (للنتائج المحسوبة وشاشات النهاية)", minSel: "الحد الأدنى للاختيارات", maxSel: "الحد الأقصى للاختيارات",
    minChars: "الحد الأدنى للأحرف", maxChars: "الحد الأقصى للأحرف", placeholder: "النص التوضيحي", minimum: "الحد الأدنى", maximum: "الحد الأقصى",
    filesAllowed: "عدد الملفات المسموح (1–5)", fileNote: "PDF أو صور أو نصوص أو Word أو Excel، حتى 10 ميغابايت.",
    imageAddress: "رابط الصورة", imageDescription: "وصف الصورة", imageAltHint: "لمن لا يستطيع رؤيتها",
    tipBefore: "تلميح: أدرج إجابة سابقة بـ ", tipMid: " (رمز هذا السؤال ", tipAfter: ") أو الدرجة بـ ", tipEnd: ".",
    required: "إلزامي", shownConditionally: "يظهر بشرط", logic: "المنطق",
    actionsFor: (name: string) => `إجراءات ${name}`, duplicateSection: "كرّر القسم", duplicate: "كرّر",
    removeSectionHeading: "احذف عنوان القسم", delete: "احذف", showSectionIf: "أظهر هذا القسم إذا", showQuestionIf: "أظهر هذا السؤال إذا",
  },
};

const labelClass = "text-[13px] font-medium text-muted-foreground";

function ChoiceList({ kind, items, onChange, prefix, withScores }: { kind: "options" | "rows" | "columns"; items: Choice[]; onChange: (c: Choice[]) => void; prefix: string; withScores?: boolean }) {
  const t = useCopy(copy);
  const label = t[kind];
  const [asText, setAsText] = useState(false);
  const [text, setText] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className={labelClass}>{label}</p>
        <button type="button" className="ws-link-quiet" onClick={() => { if (!asText) setText(items.map((i) => i.label).join("\n")); else onChange(optionsFromText(text, items, prefix)); setAsText(!asText); }}>
          {asText ? t.apply : t.editAsText}
        </button>
      </div>
      {asText ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(12, Math.max(4, items.length + 1))} className="kb-input text-sm" aria-label={t.onePerLine(label)} />
      ) : (
        <ul className="space-y-1">
          {items.map((c, i) => (
            <li key={c.id} className="flex gap-2 items-center ws-reveal-host">
              <input value={c.label} onChange={(e) => onChange(items.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)))} className="kb-input py-1.5 text-sm flex-1" aria-label={t.itemN(label, i + 1)} />
              {withScores && (
                <input type="number" value={c.score ?? ""} placeholder={t.score} aria-label={t.scoreFor(c.label)} className="kb-input py-1.5 text-sm w-20"
                  onChange={(e) => onChange(items.map((x) => (x.id === c.id ? (e.target.value === "" ? (({ score: _s, ...rest }) => rest)(x) : { ...x, score: Number(e.target.value) }) : x)))} />
              )}
              <button type="button" disabled={i === 0} onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }} aria-label={t.moveUp} className="ws-icon-button ws-reveal disabled:opacity-30"><ArrowUp size={14} /></button>
              <button type="button" onClick={() => onChange(items.filter((x) => x.id !== c.id))} aria-label={t.remove(c.label || t.option)} className="ws-icon-button text-muted-foreground hover:text-destructive"><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      {!asText && (
        <button type="button" onClick={() => onChange([...items, { id: newId(prefix), label: t.newItem(kind, items.length + 1) }])} className="ws-link-quiet flex items-center gap-1">
          <Plus size={14} /> {t.addItem(kind)}
        </button>
      )}
    </div>
  );
}

/**
 * One question. Only what almost everyone needs is visible: the question, its
 * options and "Required". Type changes, limits, scores and images live under
 * "More options"; moving, duplicating and deleting live in the "…" menu.
 */
export default function FieldEditor({ field, index, def, onChange, onDuplicate, onRemove, onMove, readOnly }: {
  field: FormField;
  index: number;
  def: FormDefinition;
  onChange: (next: FormField) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  readOnly?: boolean;
}) {
  const t = useCopy(copy);
  const labels = useBuilderLabels();
  const [showLogic, setShowLogic] = useState(!!field.showIf);
  const [scores, setScores] = useState(!!field.options?.some((o) => o.score !== undefined));
  const [showDescription, setShowDescription] = useState(false);
  const set = (patch: Partial<FormField>) => {
    const next = { ...field, ...patch };
    if (patch.options && next.quiz) {
      const optionIds = new Set(patch.options.map((option) => option.id));
      next.quiz = { ...next.quiz, correctOptionIds: next.quiz.correctOptionIds.filter((id) => optionIds.has(id)) };
    }
    for (const k of Object.keys(patch) as (keyof FormField)[]) if (patch[k] === undefined) delete next[k];
    onChange(next);
  };
  const num = (v: string) => (v === "" ? undefined : Number(v));
  const answerable = isAnswerable(field);
  const quizEligible = def.quiz?.enabled && (field.type === "choice" || field.type === "dropdown" || field.type === "multi_choice");
  const hasOptions = field.type === "choice" || field.type === "dropdown" || field.type === "multi_choice" || field.type === "ranking";
  const name = field.type === "section" ? t.sectionTitle : field.type === "statement" ? t.heading : t.question;

  return (
    <fieldset disabled={readOnly} className="space-y-4">
      <label className="block">
        <span className="sr-only">{name}</span>
        <input value={field.label} onChange={(e) => set({ label: e.target.value })} className="kb-input !text-[17px] font-medium" maxLength={500}
          placeholder={field.type === "section" ? t.sectionTitle : field.type === "statement" ? t.headingOptional : t.typeQuestion} />
      </label>
      {showDescription || field.description || field.type === "statement" ? (
        <label className="block">
          <span className="sr-only">{field.type === "statement" ? t.text : t.description}</span>
          <textarea value={field.description ?? ""} onChange={(e) => set({ description: e.target.value || undefined })} rows={field.type === "statement" ? 4 : 2}
            className="kb-input text-sm" maxLength={5000} placeholder={field.type === "statement" ? t.text : t.descriptionOptional} autoFocus={showDescription && !field.description} />
        </label>
      ) : field.type !== "section" && (
        <button type="button" onClick={() => setShowDescription(true)} className="ws-link-quiet flex items-center gap-1"><Plus size={14} /> {t.addDescription}</button>
      )}

      {hasOptions && <ChoiceList kind="options" items={field.options ?? []} onChange={(options) => set({ options })} prefix="o" withScores={scores && field.type !== "ranking"} />}
      {quizEligible && (
        <div className="rounded-lg border border-[var(--ws-line-strong)] p-4 space-y-3" aria-label={t.answerKey}>
          <div>
            <p className="text-sm font-semibold">{t.correct}</p>
            <p className="text-xs text-muted-foreground">{t.onlyYou}</p>
          </div>
          <div className="space-y-1">
            {(field.options ?? []).map((option) => {
              const selected = field.quiz?.correctOptionIds.includes(option.id) ?? false;
              return <label key={option.id} className="flex items-center gap-2 text-sm min-h-9">
                <input type={field.type === "multi_choice" ? "checkbox" : "radio"} name={`correct-${field.id}`} checked={selected}
                  onChange={() => {
                    const correctOptionIds = field.type === "multi_choice"
                      ? selected ? (field.quiz?.correctOptionIds ?? []).filter((id) => id !== option.id) : [...(field.quiz?.correctOptionIds ?? []), option.id]
                      : [option.id];
                    set({ quiz: { correctOptionIds, points: field.quiz?.points ?? 1, explanation: field.quiz?.explanation } });
                  }} />
                {option.label || t.untitledOption}
              </label>;
            })}
          </div>
          <details className="ws-field-more">
            <summary><ChevronRight size={15} className="rtl:rotate-180" /> {t.pointsAndExplanation}</summary>
            <div className="space-y-3 pt-2">
              <label className={`${labelClass} block`}>{t.points}
                <input type="number" min={0} max={1000} value={field.quiz?.points ?? 1}
                  onChange={(e) => set({ quiz: { correctOptionIds: field.quiz?.correctOptionIds ?? [], points: Number(e.target.value), explanation: field.quiz?.explanation } })}
                  className="kb-input mt-1 w-28" />
              </label>
              <label className={`${labelClass} block`}>{t.explanation}
                <textarea value={field.quiz?.explanation ?? ""} onChange={(e) => set({ quiz: { correctOptionIds: field.quiz?.correctOptionIds ?? [], points: field.quiz?.points ?? 1, explanation: e.target.value || undefined } })}
                  className="kb-input mt-1" rows={2} maxLength={2000} />
              </label>
            </div>
          </details>
        </div>
      )}
      {field.type === "matrix" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChoiceList kind="rows" items={field.rows ?? []} onChange={(rows) => set({ rows })} prefix="r" />
          <ChoiceList kind="columns" items={field.options ?? []} onChange={(options) => set({ options })} prefix="o" />
        </div>
      )}
      {field.type === "email" && <p className="text-xs text-muted-foreground" data-testid="email-unverified-note">{t.emailNote}</p>}
      {field.type === "rating" && (
        <div className="space-y-1">
          <label className={`${labelClass} flex items-center gap-2`}>{t.stars} <input type="number" min={3} max={10} value={field.max ?? 5} onChange={(e) => set({ max: num(e.target.value) })} className="kb-input py-1 w-20" /></label>
          {!field.required && <p className="text-xs text-muted-foreground">{t.ratingNote}</p>}
        </div>
      )}
      {field.type === "scale" && (
        <div className="flex gap-3 flex-wrap">
          <label className={labelClass}>{t.from} <Select size="sm" className="w-20 mt-1 flex" value={String(field.min ?? 1) as "0" | "1"} onChange={(v) => set({ min: Number(v) })} options={[{ value: "0", label: "0" }, { value: "1", label: "1" }]} /></label>
          <label className={labelClass}>{t.to} <input type="number" min={2} max={10} value={field.max ?? 5} onChange={(e) => set({ max: num(e.target.value) })} className="kb-input py-1 w-20 mt-1" /></label>
          <label className={labelClass}>{t.scaleStep} <input type="number" min={1} max={9} step={1} value={field.step ?? 1} onChange={(e) => set({ step: e.target.value === "" || Number(e.target.value) === 1 ? undefined : Number(e.target.value) })} className="kb-input py-1 w-20 mt-1" /></label>
          <label className={`${labelClass} flex-1 min-w-32`}>{t.lowLabel} <input value={field.minLabel ?? ""} onChange={(e) => set({ minLabel: e.target.value || undefined })} className="kb-input py-1 mt-1" /></label>
          <label className={`${labelClass} flex-1 min-w-32`}>{t.highLabel} <input value={field.maxLabel ?? ""} onChange={(e) => set({ maxLabel: e.target.value || undefined })} className="kb-input py-1 mt-1" /></label>
        </div>
      )}

      <details className="ws-field-more">
        <summary><ChevronRight size={15} className="rtl:rotate-180" /> {t.moreOptions}</summary>
        <div className="space-y-4 pt-3">
          <label className="block">
            <span className={labelClass}>{t.questionType}</span>
            <Select className="mt-1 w-full max-w-xs flex" value={field.type} onChange={(v) => onChange(convertField(field, v))}
              options={fieldTypes.map((ft) => ({ value: ft, label: labels.fieldType(ft) }))} />
          </label>
          {(field.type === "choice" || field.type === "dropdown" || field.type === "multi_choice") && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={scores} onChange={(e) => { setScores(e.target.checked); if (!e.target.checked) set({ options: field.options?.map(({ score: _s, ...o }) => o) }); }} /> {t.giveScores}</label>
          )}
          {field.type === "multi_choice" && (
            <div className="flex gap-3 flex-wrap">
              <label className={labelClass}>{t.minSel} <input type="number" min={0} value={field.min ?? ""} onChange={(e) => set({ min: num(e.target.value) })} className="kb-input py-1 w-20 mt-1" /></label>
              <label className={labelClass}>{t.maxSel} <input type="number" min={1} value={field.max ?? ""} onChange={(e) => set({ max: num(e.target.value) })} className="kb-input py-1 w-20 mt-1" /></label>
            </div>
          )}
          {(field.type === "text" || field.type === "textarea") && (
            <div className="flex gap-3 flex-wrap">
              <label className={labelClass}>{t.minChars} <input type="number" min={0} value={field.min ?? ""} onChange={(e) => set({ min: num(e.target.value) })} className="kb-input py-1 w-24 mt-1" /></label>
              <label className={labelClass}>{t.maxChars} <input type="number" min={1} value={field.max ?? ""} onChange={(e) => set({ max: num(e.target.value) })} className="kb-input py-1 w-24 mt-1" /></label>
              <label className={`${labelClass} flex-1 min-w-40`}>{t.placeholder} <input value={field.placeholder ?? ""} onChange={(e) => set({ placeholder: e.target.value || undefined })} className="kb-input py-1 mt-1" /></label>
            </div>
          )}
          {field.type === "number" && (
            <div className="space-y-2">
              <div className="flex gap-3 flex-wrap">
                <label className={labelClass}>{t.minimum} <input type="number" step="any" value={field.min ?? ""} onChange={(e) => set({ min: num(e.target.value) })} className="kb-input py-1 w-24 mt-1" /></label>
                <label className={labelClass}>{t.maximum} <input type="number" step="any" value={field.max ?? ""} onChange={(e) => set({ max: num(e.target.value) })} className="kb-input py-1 w-24 mt-1" /></label>
                <label className={labelClass}>{t.step} <input type="number" step="any" min={0} value={field.step ?? ""} onChange={(e) => set({ step: num(e.target.value) })} className="kb-input py-1 w-24 mt-1" /></label>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!field.integer} onChange={(e) => set({ integer: e.target.checked || undefined })} /> {t.wholeNumbers}</label>
              <p className="text-xs text-muted-foreground">{t.stepHelp}</p>
            </div>
          )}
          {(field.type === "date" || field.type === "time") && (
            <div className="space-y-2">
              <div className="flex gap-3 flex-wrap">
                <label className={labelClass}>{field.type === "date" ? t.earliestDate : t.earliestTime} <input type={field.type} value={field.minValue ?? ""} onChange={(e) => set({ minValue: e.target.value || undefined })} className="kb-input py-1 w-44 mt-1" /></label>
                <label className={labelClass}>{field.type === "date" ? t.latestDate : t.latestTime} <input type={field.type} value={field.maxValue ?? ""} onChange={(e) => set({ maxValue: e.target.value || undefined })} className="kb-input py-1 w-44 mt-1" /></label>
              </div>
            </div>
          )}
          {field.type === "file" && (
            <label className={`${labelClass} block`}>{t.filesAllowed} <input type="number" min={1} max={5} value={field.max ?? 1} onChange={(e) => set({ max: num(e.target.value) })} className="kb-input py-1 w-20 mt-1" />
              <span className="block text-xs mt-1">{t.fileNote}</span>
            </label>
          )}
          {field.type !== "section" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className={labelClass}>{t.imageAddress} <input placeholder="https://…" value={field.image?.url ?? ""} onChange={(e) => set({ image: e.target.value ? { url: e.target.value, alt: field.image?.alt ?? "" } : undefined })} className="kb-input py-1 mt-1" /></label>
              <label className={labelClass}>{t.imageDescription} <input placeholder={t.imageAltHint} value={field.image?.alt ?? ""} disabled={!field.image} onChange={(e) => set({ image: field.image ? { ...field.image, alt: e.target.value } : undefined })} className="kb-input py-1 mt-1" /></label>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t.tipBefore}<bdi dir="ltr">{"{{question-id}}"}</bdi>{t.tipMid}<code>{field.id}</code>{t.tipAfter}<bdi dir="ltr">{"{{score}}"}</bdi>{t.tipEnd}</p>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ws-line)] pt-3">
        {answerable ? <span className="me-auto"><WsSwitch checked={field.required} label={t.required} onChange={(required) => set({ required })} /></span> : <span className="me-auto" />}
        {index > 0 && (
          <button type="button" onClick={() => setShowLogic(!showLogic)} className={`ws-btn ws-btn--ghost ws-btn--sm ${field.showIf ? "text-[var(--primary)]" : ""}`} aria-expanded={showLogic}>
            <GitBranch size={15} /> {field.showIf ? t.shownConditionally : t.logic}
          </button>
        )}
        <WsMenu label={t.actionsFor(field.label || labels.fieldType(field.type))} triggerClassName="ws-icon-button">
          {(close) => (
            <>
              <button type="button" role="menuitem" onClick={() => { close(); onMove(-1); }}><ArrowUp size={16} /> {t.moveUp}</button>
              <button type="button" role="menuitem" onClick={() => { close(); onMove(1); }}><ArrowDown size={16} /> {t.moveDown}</button>
              <button type="button" role="menuitem" onClick={() => { close(); onDuplicate(); }}><Copy size={16} /> {field.type === "section" ? t.duplicateSection : t.duplicate}</button>
              <hr />
              <button type="button" role="menuitem" className="text-[var(--error)]" onClick={() => { close(); onRemove(); }}><Trash2 size={16} /> {field.type === "section" ? t.removeSectionHeading : t.delete}</button>
            </>
          )}
        </WsMenu>
      </div>
      {showLogic && index > 0 && (
        <div className="rounded-lg border border-dashed border-[var(--ws-line-strong)] p-3">
          <RuleEditor def={def} rule={field.showIf} before={index} allowScore onChange={(showIf) => set({ showIf })}
            label={field.type === "section" ? t.showSectionIf : t.showQuestionIf} />
        </div>
      )}
    </fieldset>
  );
}
