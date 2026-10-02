"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, Radio } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { formatNumber, useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import "./games.css";

const copy = {
  en: {
    loading: "Loading past games…", empty: "No games yet. Host a published quiz and it shows up here.",
    live: "Live now", ended: "Ended", open: "Open", results: "Results",
    players: (n: string) => `${n} players`, questions: (n: number) => `${n} ${n === 1 ? "question" : "questions"}`,
  },
  ar: {
    loading: "جارٍ تحميل الألعاب السابقة…", empty: "لا ألعاب بعد. استضف اختبارًا منشورًا ليظهر هنا.",
    live: "مباشرة الآن", ended: "انتهت", open: "افتح", results: "النتائج",
    players: (n: string) => `${n} لاعبين`, questions: (n: number) => `${n} أسئلة`,
  },
};

/** Games this account hosted, newest first: rejoin a running game or open its saved results. */
export default function GameHistory({ limit }: { limit?: number }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const games = useQuery(api.live.myGames);
  if (games === undefined) return <p className="games-help" role="status">{t.loading}</p>;
  if (games.length === 0) return <p className="games-empty">{t.empty}</p>;
  return (
    <div className="games-quiz-list">
      {games.slice(0, limit).map((game) => {
        const running = game.state !== "ended";
        const href = running ? `/dashboard/live/${game._id}`
          : game.formId ? `/dashboard/forms/${game.formId}/responses`
          : game.quizId ? `/dashboard/results?id=${game.quizId}` : null;
        const meta = [
          running ? t.live : t.ended,
          timeAgo(locale, game.endedAt ?? game.createdAt),
          t.questions(game.questionCount),
          ...(game.players !== null ? [t.players(formatNumber(locale, game.players))] : []),
        ].join(" · ");
        return (
          <article key={game._id}>
            <div className="games-quiz-list__title"><h3>{game.title}</h3><p>{meta}</p></div>
            {href && (
              <div className="games-quiz-list__actions">
                <Link className={running ? "ws-btn ws-btn--primary" : "ws-btn"} href={href}>
                  {running ? <><Radio size={16} aria-hidden="true" />{t.open}</> : <>{t.results}<ArrowRight size={15} aria-hidden="true" className="rtl:rotate-180" /></>}
                </Link>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
