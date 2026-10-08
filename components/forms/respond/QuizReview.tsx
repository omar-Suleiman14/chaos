"use client";
import { Check, X } from "lucide-react";
import { isRtl, localizeField } from "@/convex/formLogic";
import type { Answers, FormDefinition, Language } from "@/convex/formLogic";
import type { QuizReviewItem } from "@/convex/formQuiz";

const text = {
  en: { title: "Your answers", yours: "Your answer", correct: "Correct answer", none: "No answer", marks: (e: number, p: number) => `${e} / ${p}`, right: "Correct", wrong: "Incorrect" },
  ar: { title: "إجاباتك", yours: "إجابتك", correct: "الإجابة الصحيحة", none: "بلا إجابة", marks: (e: number, p: number) => `${e} / ${p}`, right: "صحيحة", wrong: "خاطئة" },
};

/**
 * After a quiz is submitted: each graded question with what the respondent chose, the right
 * answer where they missed it, and the creator's explanation, so they can see what went wrong.
 */
export function QuizReview({ def, review, answers, language }: { def: FormDefinition; review: QuizReviewItem[]; answers: Answers; language: Language }) {
  const t = language === "ar" ? text.ar : text.en;
  const fields = new Map(def.fields.map((f) => [f.id, f]));
  const items = review.flatMap((r) => {
    const raw = fields.get(r.fieldId);
    return raw ? [{ r, field: localizeField(raw, language, def) }] : [];
  });
  if (!items.length) return null;
  return (
    <section className="form-review" dir={isRtl(language) ? "rtl" : "ltr"} lang={language} aria-label={t.title}>
      <h2 className="form-review__title form-heading">{t.title}</h2>
      <ol className="form-review__list">
        {items.map(({ r, field }, i) => {
          const label = (id: string) => field.options?.find((o) => o.id === id)?.label ?? id;
          const value = answers[field.id];
          const chosen = (Array.isArray(value) ? value : typeof value === "string" ? [value] : []).filter((x): x is string => typeof x === "string");
          const right = r.possible > 0 ? r.earned >= r.possible : chosen.length > 0 && r.correctOptionIds.length > 0 && r.correctOptionIds.every((id) => chosen.includes(id)) && chosen.every((id) => r.correctOptionIds.includes(id));
          return (
            <li key={r.fieldId} className="form-review__item" data-right={right || undefined} style={{ ["--i" as string]: Math.min(i, 8) }}>
              <div className="form-review__head">
                <span className="form-review__mark" aria-label={right ? t.right : t.wrong} role="img">{right ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}</span>
                <p className="form-review__q">{field.label}</p>
                <span className="form-review__marks" dir="ltr">{t.marks(r.earned, r.possible)}</span>
              </div>
              <dl className="form-review__answers">
                <div><dt>{t.yours}</dt><dd>{chosen.length ? chosen.map(label).join(", ") : <span className="form-muted">{t.none}</span>}</dd></div>
                {!right && r.correctOptionIds.length > 0 && <div data-key><dt>{t.correct}</dt><dd>{r.correctOptionIds.map(label).join(", ")}</dd></div>}
              </dl>
              {r.explanation && <p className="form-review__why">{r.explanation}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
