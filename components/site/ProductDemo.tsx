"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Trophy } from "lucide-react";
import { ThemePicker } from "@/components/ThemePicker";
import { emptyDefinition } from "@/convex/formLogic";
import type { ThemePresetId } from "@/convex/formLogic";
import { themeClass, themeFromPreset, themeStyle } from "@/components/forms/formThemes";
import { AnswerTile } from "@/components/live/tiles";
import { gameThemeProps } from "@/components/live/GameTheme";
import { useCopy } from "@/lib/i18n";
import "@/components/live/live.css";
import "./productDemo.css";

const copy = {
  en: {
    label: "Chaos preview", form: "Form", game: "Live game", theme: "Theme", caption: "Preview only. Answers are not submitted.",
    eyebrow: "A little introduction", questions: [
      { title: "What kind of day are we making?", options: ["Something a little unexpected", "A good conversation", "A room full of energy"] },
      { title: "And who’s coming along?", options: ["My team", "My class", "Everyone’s invited"] },
      { title: "One last thing. Make it…", options: ["Quiet and considered", "Bright and playful", "Unmistakably mine"] },
    ],
    next: "OK", finish: "That’s me", back: "Previous question", again: "Play it again", done: "That’s more like you.", doneBody: "Good questions deserve a little personality. Make yours next.",
    progress: (n: number) => `${n} of 3`, keyboard: "press Enter ↵", choose: "Choose an answer", gameTitle: "How many sides does a hexagon have?", gameNote: "Try a round. Pick an answer, then see the reveal.",
    gameOptions: ["Four", "Five", "Six", "Eight"], correct: "You got it!", wrong: "Six sides make a hexagon.", reveal: "In a hosted game, the timer and host control the reveal. Fast correct answers earn more points.", score: "+1,000 points", gamePreview: "Live game preview", previewPin: "GAME PIN", players: "24 players", round: "Question 1 / 1", allThemes: "All 18 themes",
  },
  ar: {
    label: "معاينة Chaos", form: "نموذج", game: "لعبة مباشرة", theme: "المظهر", caption: "معاينة فقط. لا تُرسل الإجابات.",
    eyebrow: "تعارف بسيط", questions: [
      { title: "أي يوم نصنع اليوم؟", options: ["شيئًا غير متوقع", "محادثة جميلة", "حماسًا يجمع الجميع"] },
      { title: "ومَن سيشاركنا؟", options: ["فريقي", "صفي", "الجميع مدعو"] },
      { title: "لمسة أخيرة. اجعله…", options: ["هادئًا ومتأنيًا", "مشرقًا ومرحًا", "يشبهني تمامًا"] },
    ],
    next: "حسنًا", finish: "هذا أنا", back: "السؤال السابق", again: "جرّب مجددًا", done: "الآن يشبهك أكثر.", doneBody: "تستحق الأسئلة الجيدة بعض الشخصية. اصنع أسئلتك الآن.",
    progress: (n: number) => `${n} من 3`, keyboard: "اضغط Enter ↵", choose: "اختر إجابة", gameTitle: "كم ضلعًا للمسدّس؟", gameNote: "جرّب جولة. اختر إجابة ثم شاهد النتيجة.",
    gameOptions: ["أربعة", "خمسة", "ستة", "ثمانية"], correct: "إجابة صحيحة!", wrong: "للمسدّس ستة أضلاع.", reveal: "في اللعبة المباشرة يتحكم المؤقت والمضيف في كشف الإجابة. تكسب الإجابات الصحيحة السريعة نقاطًا أكثر.", score: "+١٬٠٠٠ نقطة", gamePreview: "معاينة لعبة مباشرة", previewPin: "رمز اللعبة", players: "24 لاعبًا", round: "السؤال 1 / 1", allThemes: "المظاهر الـ18",
  },
};

export default function ProductDemo() {
  const t = useCopy(copy);
  const [mode, setMode] = useState<"form" | "game">("form");
  const [preset, setPreset] = useState<ThemePresetId>("terracotta");
  const [allThemes, setAllThemes] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [direction, setDirection] = useState(1);
  const heading = useRef<HTMLHeadingElement>(null);
  const definition = { ...emptyDefinition(), theme: themeFromPreset(preset) };
  const question = t.questions[step];
  const selected = answers[step] !== undefined;
  const advance = () => { if (!selected) return; if (step === 2) setFinished(true); else { setDirection(1); setStep(step + 1); } requestAnimationFrame(() => heading.current?.focus()); };
  const reset = () => { setStep(0); setFinished(false); setAnswers({}); setPicked(null); };
  useEffect(() => {
    if (mode !== "form" || finished) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.target instanceof HTMLElement) || !event.target.closest(".site-demo__stage") || event.altKey || event.ctrlKey || event.metaKey) return;
      const index = event.key.toLowerCase().charCodeAt(0) - 97;
      if (event.key.length === 1 && index >= 0 && index < question.options.length) { event.preventDefault(); setAnswers((old) => ({ ...old, [step]: index })); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, finished, step, question.options.length]);
  return (
    <section className="site-demo site-demo--new" aria-label={t.label}>
      <div className="site-demo__top"><div className="site-demo__switch" aria-label={t.label}><button type="button" aria-pressed={mode === "form"} onClick={() => setMode("form")}>{t.form}</button><button type="button" aria-pressed={mode === "game"} onClick={() => setMode("game")}>{t.game}</button></div></div>
      {mode === "form" ? <div className={`site-demo__stage ${themeClass(definition)}`} style={themeStyle(definition)}>
        <div className="site-demo__stage-top"><span>{t.eyebrow}</span><span>{finished ? <Check size={18} /> : t.progress(step + 1)}</span></div>
        <form className="site-demo__conversation" onSubmit={(e) => { e.preventDefault(); advance(); }}>
          <div key={finished ? "done" : step} className="site-demo__scene" data-direction={direction}>
            <h2 className="form-heading" ref={heading} tabIndex={-1}>{finished ? t.done : question.title}</h2>
            {finished ? <p className="form-muted">{t.doneBody}</p> : <fieldset><legend className="sr-only">{question.title}</legend>{question.options.map((answer, i) => <label key={answer} className="site-demo__answer" data-selected={answers[step] === i}><input className="sr-only" type="radio" name={`demo-${step}`} checked={answers[step] === i} onChange={() => setAnswers((old) => ({ ...old, [step]: i }))} /><span className="site-demo__key" aria-hidden="true">{String.fromCharCode(65 + i)}</span><span>{answer}</span>{answers[step] === i && <Check size={18} aria-hidden="true" />}</label>)}</fieldset>}
          </div>
          <div className="site-demo__controls">{finished ? <button type="button" className="form-btn" onClick={reset}><RotateCcw size={16} />{t.again}</button> : <><button type="submit" className="form-btn" disabled={!selected}>{step === 2 ? t.finish : t.next}<Check size={18} /></button><span className="form-muted">{t.keyboard}</span>{step > 0 && <button type="button" className="site-demo__back" aria-label={t.back} onClick={() => { setDirection(-1); setStep(step - 1); requestAnimationFrame(() => heading.current?.focus()); }}><ArrowLeft size={18} className="site-arrow" /></button>}</>}</div>
        </form>
        <div className="site-demo__meter" aria-hidden="true"><span style={{ width: `${finished ? 100 : step / 3 * 100}%` }} /></div>
        <div className="site-demo__orb" aria-hidden="true"><span /><span /><span /></div>
      </div> : <div {...gameThemeProps(definition.theme)} className={`${gameThemeProps(definition.theme).className} site-demo__game`} aria-label={t.gamePreview}>
        <div className="site-demo__game-top"><span>{t.round}</span><span>{t.previewPin} <b dir="ltr">123 456</b></span><span>{t.players}</span></div>
        <div key={picked === null ? "question" : "result"} className="site-demo__game-question"><Trophy size={32} aria-hidden="true" /><h2 className="form-heading">{picked === null ? t.gameTitle : picked === 2 ? t.correct : t.wrong}</h2><p className="live-muted">{picked === null ? t.gameNote : t.reveal}</p>{picked === 2 && <strong className="site-demo__score">{t.score}</strong>}</div>
        <div className="live-tiles">{t.gameOptions.map((option, i) => <AnswerTile key={option} index={i} label={option} showLabel size="host" onSelect={() => setPicked(i)} disabled={picked !== null} result={picked === null ? undefined : i === 2 ? "correct" : "wrong"} />)}</div>
        {picked !== null && <button type="button" className="live-btn site-demo__replay" onClick={() => setPicked(null)}><RotateCcw size={16} />{t.again}</button>}
      </div>}
      <div className="site-demo__theme-bar" data-expanded={allThemes}><p>{t.theme}<ArrowRight size={15} className="site-arrow" /></p><ThemePicker value={preset} onChange={setPreset} label={t.theme} expandable={false} ids={allThemes ? undefined : ["terracotta", "velvet", "midnight", "arcade", "ocean", "google-forms"]} className="site-demo__theme-picker" /><button type="button" className="site-demo__all-themes" aria-expanded={allThemes} onClick={() => setAllThemes((old) => !old)}>{t.allThemes}</button></div>
      <p className="site-demo__caption">{t.caption}</p>
    </section>
  );
}
