"use client";
import { Check } from "lucide-react";
import { formatNumber, useCopy, useLocale } from "@/lib/i18n";
import { ChangeBadge, compareItems, type VersionChange } from "./VersionBrowser";

/** A question as version sheets show it, for quizzes, quiz forms and games. */
export type SheetQuestion = { id: string; text: string; options: string[]; answerKey: string[]; points: number; timeLimit: number | null };

const copy = {
  en: { marks: (n: number, f: string) => (n === 1 ? "1 mark" : `${f} marks`), limit: (n: string) => `${n} s limit`, keyChanged: "Answer key changed", answerKey: "Correct answer" },
  ar: {
    marks: (n: number, f: string) => (n === 1 ? "درجة واحدة" : n === 2 ? "درجتان" : n >= 3 && n <= 10 ? `${f} درجات` : `${f} درجة`), limit: (n: string) => `مهلة ${n} ث`,
    keyChanged: "تغيّر مفتاح الإجابة", answerKey: "الإجابة الصحيحة",
  },
};

export const compareQuestions = (base: readonly SheetQuestion[], other: readonly SheetQuestion[]) => compareItems(base, other, (q) => q.id);

/** A version's questions, each marked against the version it is compared with. */
export function QuestionSheet({ questions, against, side, showPoints = true }: { questions: SheetQuestion[]; against?: SheetQuestion[]; side: "base" | "other"; showPoints?: boolean }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(locale, n);
  const diff = against ? (side === "base" ? compareQuestions(questions, against) : compareQuestions(against, questions)) : null;
  const counterpart = diff ? (side === "base" ? diff.theirs : diff.mine) : new Map<string, SheetQuestion>();
  return (
    <ol className="vb-questions">
      {questions.map((q, n) => {
        const c: VersionChange = diff ? diff.change(q, side) : "same";
        const other = counterpart.get(q.id);
        const compared = c === "changed" && other;
        const keyChanged = compared && JSON.stringify([...q.answerKey].sort()) !== JSON.stringify([...other.answerKey].sort());
        return (
          <li key={q.id} className="vb-q" data-change={c} style={{ ["--n" as string]: Math.min(n, 8) }}>
            <div className="vb-q__head">
              <span className="vb-q__num">{fmt(n + 1)}</span>
              <p dir="auto">{compared && other.text !== q.text ? <mark>{q.text}</mark> : q.text}</p>
              <ChangeBadge change={c} />
            </div>
            {q.options.length > 0 && (
              <ul className="vb-q__options">
                {q.options.map((o, i) => {
                  const isKey = q.answerKey.includes(o);
                  const novel = compared && !other.options.includes(o);
                  return (
                    <li key={`${i}-${o}`} data-key={isKey || undefined} data-diff={novel ? (side === "base" ? "added" : "removed") : undefined}>
                      <span className="vb-q__mark" aria-hidden>{isKey ? <Check size={11} strokeWidth={3} /> : null}</span>
                      <span dir="auto">{o}</span>
                      {isKey && <span className="sr-only">{t.answerKey}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            {(showPoints || q.timeLimit !== null || keyChanged) && (
              <p className="vb-q__meta">
                {showPoints && (compared && other.points !== q.points ? <mark>{t.marks(q.points, fmt(q.points))}</mark> : t.marks(q.points, fmt(q.points)))}
                {q.timeLimit !== null && <>{showPoints ? " · " : ""}{t.limit(fmt(q.timeLimit))}</>}
                {keyChanged && <span className="vb-q__key">{t.keyChanged}</span>}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
