"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import FormRenderer, { themeClass, themeStyle } from "@/components/forms/FormRenderer";
import { calculatedScore, describeRule, explainVisibility, newId, selectEnding, visibleFieldIds } from "@/convex/formLogic";
import type { AnswerValue, Answers, FormDefinition, Language } from "@/convex/formLogic";
import { useCopy, useLocale } from "@/lib/i18n";
import { localizeMessage } from "@/lib/messages";
import RuleEditor from "./RuleEditor";
import DocHint from "@/components/forms/DocHint";
import { Select } from "@/components/workspace/Select";

const copy = {
  en: {
    overview: "Branching overview", branching: "Branching",
    branchingHelp: "Add conditions with a question’s Logic button.",
    allShown: "Every question is always shown.", showsWhen: " shows when ", endings: "Endings", addEnding: "Add ending", thankYou: "Thank you",
    endingsHelpBefore: "Respondents see the first ending whose conditions match, otherwise the first ending without conditions. Use ", endingsHelpMid: " and ", endingsHelpAfter: " to show results.",
    standardThanks: "Respondents see a standard thank-you message.", ending: (n: number) => `Ending ${n}`, title: "Title", message: "Message",
    endingTitle: (n: number) => `Ending ${n} title`, endingMessage: (n: number) => `Ending ${n} message`, showEndingIf: "Show this ending if",
    moveUp: "Move up", remove: "Remove", debugger: "Logic debugger", test: "Test your logic", testLanguage: "Test language", reset: "Reset",
    pipingExample: "E.g. “Thanks, {{name}}!” when a question’s id is name.",
    testHelp: "Answer as a respondent would. Nothing is saved.", checkEnding: "Check ending", score: "Score", endingLabel: "Ending", soFar: " so far", standardShort: "Standard thank-you",
  },
  ar: {
    overview: "نظرة عامة على التفرّع", branching: "التفرّع",
    branchingHelp: "أضف الشروط من زر المنطق في أي سؤال.",
    allShown: "كل الأسئلة تظهر دائمًا.", showsWhen: " يظهر عندما ", endings: "شاشات النهاية", addEnding: "أضف شاشة نهاية", thankYou: "شكرًا لك",
    endingsHelpBefore: "يرى المجيبون أول شاشة نهاية تنطبق شروطها، وإلا أول شاشة بلا شروط. استخدم ", endingsHelpMid: " و", endingsHelpAfter: " لعرض النتائج.",
    standardThanks: "يرى المجيبون رسالة شكر افتراضية.", ending: (n: number) => `شاشة النهاية ${n}`, title: "العنوان", message: "الرسالة",
    endingTitle: (n: number) => `عنوان شاشة النهاية ${n}`, endingMessage: (n: number) => `رسالة شاشة النهاية ${n}`, showEndingIf: "أظهر شاشة النهاية هذه إذا",
    moveUp: "انقل لأعلى", remove: "احذف", debugger: "أداة فحص المنطق", test: "اختبر المنطق", testLanguage: "لغة الاختبار", reset: "إعادة ضبط",
    pipingExample: "مثال: «شكرًا يا {{name}}!» إذا كان رمز السؤال name.",
    testHelp: "أجب كما يفعل المجيب. لا يُحفظ شيء.", checkEnding: "افحص شاشة النهاية", score: "الدرجة", endingLabel: "شاشة النهاية", soFar: " حتى الآن", standardShort: "رسالة الشكر الافتراضية",
  },
};

export default function LogicTab({ def, change, readOnly, errors }: {
  def: FormDefinition;
  change: (updater: (d: FormDefinition) => FormDefinition) => void;
  readOnly: boolean;
  errors: string[];
}) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const [answers, setAnswers] = useState<Answers>({});
  const [language, setLanguage] = useState<Language>(def.defaultLanguage);
  const [submitted, setSubmitted] = useState(false);
  const explanations = useMemo(() => explainVisibility(def, answers), [def, answers]);
  const visible = useMemo(() => visibleFieldIds(def, answers), [def, answers]);
  const ending = useMemo(() => selectEnding(def, answers), [def, answers]);
  const score = useMemo(() => calculatedScore(def, answers, visible), [def, answers, visible]);
  const ruled = def.fields.filter((f) => f.showIf?.conditions.length);
  const logicErrors = errors.filter((e) => /condition|never be shown|branching|later/i.test(e));
  const debugDef: FormDefinition = { ...def, presentation: "page" };

  const setEnding = (id: string, patch: Partial<FormDefinition["endings"][number]>) =>
    change((d) => ({ ...d, endings: d.endings.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-6">
        <section className="chaos-card bg-card p-5 space-y-3" aria-label={t.overview}>
          <h2 className="chaos-heading text-sm">{t.branching}</h2>
          <DocHint slug="logic">{t.branchingHelp}</DocHint>
          {logicErrors.length > 0 && (
            <ul className="text-sm text-destructive list-disc ps-5" role="alert">{logicErrors.map((e) => <li key={e}>{localizeMessage(locale, e)}</li>)}</ul>
          )}
          {ruled.length === 0 ? <p className="text-sm text-muted-foreground">{t.allShown}</p> : (
            <ul className="space-y-2 text-sm">
              {ruled.map((f) => (
                <li key={f.id} className="border-s-4 border-primary ps-3">
                  <span className="font-medium">{f.label || f.id}</span>
                  <span className="text-muted-foreground">{t.showsWhen}{localizeMessage(locale, describeRule(f.showIf!, def))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="chaos-card bg-card p-5 space-y-4" aria-label={t.endings}>
          <div className="flex items-center justify-between">
            <h2 className="chaos-heading text-sm">{t.endings}</h2>
            {!readOnly && (
              <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => change((d) => ({ ...d, endings: [...d.endings, { id: newId("e"), title: t.thankYou, message: "" }] }))}>
                <Plus size={14} /> {t.addEnding}
              </button>
            )}
          </div>
          <DocHint slug="endings">{t.endingsHelpBefore}<bdi dir="ltr">{"{{score}}"}</bdi>{t.endingsHelpMid}<bdi dir="ltr">{"{{question-id}}"}</bdi>{t.endingsHelpAfter} {t.pipingExample}</DocHint>
          {def.endings.length === 0 && <p className="text-sm text-muted-foreground">{t.standardThanks}</p>}
          {def.endings.map((e, i) => (
            <fieldset key={e.id} disabled={readOnly} className="border-2 border-foreground/10 p-3 space-y-2">
              <legend className="chaos-heading text-[10px] px-1">{t.ending(i + 1)}</legend>
              <input value={e.title} onChange={(ev) => setEnding(e.id, { title: ev.target.value })} className="kb-input text-sm" placeholder={t.title} aria-label={t.endingTitle(i + 1)} />
              <textarea value={e.message} onChange={(ev) => setEnding(e.id, { message: ev.target.value })} className="kb-input text-sm" rows={3} placeholder={t.message} aria-label={t.endingMessage(i + 1)} />
              <RuleEditor def={def} rule={e.showIf} before={def.fields.length} allowScore label={t.showEndingIf}
                onChange={(showIf) => change((d) => ({ ...d, endings: d.endings.map((x) => (x.id === e.id ? (showIf ? { ...x, showIf } : (({ showIf: _s, ...rest }) => rest)(x)) : x)) }))} />
              <div className="flex gap-2">
                <button type="button" className="kb-btn kb-btn-ghost text-xs" disabled={i === 0} onClick={() => change((d) => { const n = [...d.endings]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return { ...d, endings: n }; })}>{t.moveUp}</button>
                <button type="button" className="kb-btn kb-btn-ghost text-xs text-destructive" onClick={() => change((d) => ({ ...d, endings: d.endings.filter((x) => x.id !== e.id) }))}><Trash2 size={14} /> {t.remove}</button>
              </div>
            </fieldset>
          ))}
        </section>
      </div>

      <section className="chaos-card bg-card p-5 space-y-4" aria-label={t.debugger}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="chaos-heading text-sm">{t.test}</h2>
          <div className="flex gap-2 items-center">
            {def.languages.length > 1 && (
              <Select size="sm" label={t.testLanguage} value={language} onChange={setLanguage}
                options={def.languages.map((l) => ({ value: l, label: l === "ar" ? "العربية" : "English" }))} />
            )}
            <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => { setAnswers({}); setSubmitted(false); }}><RotateCcw size={14} /> {t.reset}</button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t.testHelp}</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`ws-respondent-preview rounded-lg border border-foreground/10 max-h-[70vh] overflow-y-auto ${themeClass(debugDef)}`} style={themeStyle(debugDef)}>
            <FormRenderer definition={debugDef} skipCover language={language} answers={answers} submitLabel={t.checkEnding}
              onAnswer={(id, v: AnswerValue | undefined) => { setSubmitted(false); setAnswers((a) => { const n = { ...a }; if (v === undefined) delete n[id]; else n[id] = v; return n; }); }}
              onSubmit={() => setSubmitted(true)} />
          </div>
          <div className="space-y-3 text-sm max-h-[70vh] overflow-y-auto">
            <p><span className="chaos-heading text-[10px] text-muted-foreground">{t.score}</span> <span className="font-mono">{score}</span></p>
            <p>
              <span className="chaos-heading text-[10px] text-muted-foreground">{t.endingLabel}{submitted ? "" : t.soFar}</span>{" "}
              {ending ? (ending.title || ending.message.slice(0, 60)) : t.standardShort}
            </p>
            <ul className="space-y-1">
              {explanations.map((x) => {
                const f = def.fields.find((ff) => ff.id === x.fieldId)!;
                return (
                  <li key={x.fieldId} className={`text-xs border-s-4 ps-2 ${x.visible ? "border-primary" : "border-foreground/20 text-muted-foreground"}`}>
                    <span className="font-medium">{f.label || f.id}</span> — {localizeMessage(locale, x.reason)}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
