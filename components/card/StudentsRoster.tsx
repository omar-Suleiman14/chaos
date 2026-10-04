"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";
import { CARD_THEMES } from "@/lib/memberCard";
import Link from "@/components/site/SiteLink";

export default function StudentsRoster({ username }: { username?: string }) {
  const { locale } = useLocale(), ar = locale === "ar";
  const own = usePaginatedQuery(api.studentRoster.mine, username ? "skip" : {}, { initialNumItems: 24 });
  const publicRows = usePaginatedQuery(api.studentRoster.publicStudents, username ? { username } : "skip", { initialNumItems: 24 });
  const { results, status, loadMore } = username ? publicRows : own;
  const count = useQuery(api.studentRoster.count, username ? "skip" : {});
  const visibility = useQuery(api.studentRoster.myVisibility, username ? { username } : "skip");
  const setVisible = useMutation(api.studentRoster.setPublicVisibility);
  const [error, setError] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320), [top, setTop] = useState(0);
  useEffect(() => { const el = viewport.current; if (!el) return; const resize = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); resize.observe(el); return () => resize.disconnect(); }, []);
  const columns = Math.max(1, Math.floor(width / 210)), rowHeight = 148;
  const first = Math.max(0, Math.floor(top / rowHeight) - 2) * columns;
  const last = Math.min(results.length, (Math.ceil((top + 520) / rowHeight) + 2) * columns);
  useEffect(() => { if (status === "CanLoadMore" && last >= results.length - columns * 2) loadMore(24); }, [last, results.length, columns, status, loadMore]);
  return <section className="mc-students" aria-label={ar ? "الطلاب" : "Students"}>
    <h2>{ar ? "الطلاب" : "Students"}{!username && count !== undefined ? ` · ${count.toLocaleString(locale)}` : ""}</h2>
    <p className="mc-help">{username ? (ar ? "تظهر هنا فقط البطاقات التي وافق أصحابها على عرضها." : "Only students who choose to show their Card appear here.") : (ar ? "قائمتك خاصة. يبقى المشاركون المجهولون ضيوفًا دون حسابات عامة." : "Your roster is private. Anonymous participants remain guests without public profiles.")}</p>
    {username && visibility !== undefined && visibility !== null && <label className="mc-students__visibility"><input type="checkbox" checked={visibility} onChange={e => { const visible = e.target.checked; void setVisible({ username, visible }).catch(() => setError(ar ? "تعذر حفظ الإعداد." : "Couldn't save this setting.")); }} />{ar ? "اعرض بطاقتي هنا علنًا" : "Show my Card here publicly"}</label>}
    {error && <p role="alert">{error}</p>}
    <div ref={viewport} className="mc-students__viewport" onScroll={e => setTop(e.currentTarget.scrollTop)} tabIndex={0} aria-label={ar ? "قائمة الطلاب" : "Student list"}>
      <div style={{ height: Math.ceil(results.length / columns) * rowHeight, position: "relative" }}>
        {results.slice(first, last).map((student, offset) => {
          const index = first + offset, theme = CARD_THEMES[student.style % CARD_THEMES.length];
          const body = <><span className="mc-student__avatar" aria-hidden style={{ background: theme.art[1] }}>{student.name.slice(0, 1).toUpperCase()}</span><strong dir="auto">{student.name}</strong><span dir={student.username ? "ltr" : "auto"}>{student.username ? `@${student.username}` : (ar ? "ضيف" : "Guest")}</span>{student.context && <small dir="auto">{student.context}</small>}</>;
          const style = { position: "absolute" as const, top: Math.floor(index / columns) * rowHeight, insetInlineStart: `${(index % columns) * 100 / columns}%`, width: `${100 / columns}%`, padding: 5 };
          return <div key={student.id} style={style}>{student.username ? <Link prefetch={false} className="mc-student" href={`/card/${encodeURIComponent(student.username)}`} style={{ borderColor: theme.art[0] }}>{body}</Link> : <div className="mc-student" style={{ borderColor: theme.art[0] }}>{body}</div>}</div>;
        })}
      </div>
      {status === "LoadingFirstPage" && <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>}
      {status === "Exhausted" && !results.length && <p>{ar ? "لا توجد بطاقات طلاب بعد." : "No student cards yet."}</p>}
    </div>
    {status === "CanLoadMore" && <button className="ws-btn" onClick={() => loadMore(24)}>{ar ? "تحميل المزيد" : "Load more"}</button>}
    {status === "LoadingMore" && <p role="status">{ar ? "جارٍ تحميل المزيد…" : "Loading more…"}</p>}
  </section>;
}
