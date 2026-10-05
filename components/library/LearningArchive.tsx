"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react";
import { Archive, ArchiveRestore } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LibrarySkeleton } from "@/components/workspace/Skeletons";
import { useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";

type Row = { id: string; title: string; count: number; updatedAt: number; restore: () => Promise<unknown> };
type PageStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
type LearningKind = "courses" | "lessons" | "flashcards" | "legacy_quizzes";

/** Archived drafts stay unreadable until the owner explicitly restores them. */
/** Archived learning content. With a title, the whole section is hidden while it has nothing archived. */
export default function LearningArchive({ kind, title }: { kind: LearningKind; title?: string }) {
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(api.archive.list, isAuthenticated ? { kind } : "skip", { initialNumItems: 25 });
  const restoreCourse = useMutation(api.courses.setArchived);
  const restoreCards = useMutation(api.flashcards.setLifecycle);
  const restoreLesson = useMutation(api.lessons.setLifecycle);
  const restoreQuiz = useMutation(api.quizFunctions.setQuizArchived);
  const rows = results.map(row => ({ ...row, restore: async () => {
    if (kind === "courses") return restoreCourse({ courseId: row.id as Id<"learnCollections">, archived: false });
    if (kind === "legacy_quizzes") return restoreQuiz({ quizId: row.id as Id<"quizzes">, archived: false });
    if (row.revision === undefined) throw new Error("Reload this archive before restoring.");
    if (kind === "lessons") return restoreLesson({ lessonId: row.id as Id<"lessons">, expectedRevision: row.revision, action: "reactivate" });
    return restoreCards({ setId: row.id as Id<"flashcardSets">, expectedRevision: row.revision, action: "restore" });
  } }));
  return <ArchivedTable key={kind} kind={kind} title={title} rows={rows} status={status} loadMore={loadMore} />;
}

function ArchivedTable({ kind, title, rows, status, loadMore }: { kind: LearningKind; title?: string; rows: Row[]; status: PageStatus; loadMore: (count: number) => void }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [pending, setPending] = useState<string | null>(null);
  const run = async (row: Row) => {
    if (pending) return;
    setPending(row.id);
    try { await row.restore(); toast.success(ar ? `تمت استعادة «${row.title}» إلى مكتبتك` : `Restored “${row.title}” to your library`); }
    catch (err) { toast.error(err); }
    finally { setPending(null); }
  };
  const restoreLabel = ar ? "استعادة" : "Restore";
  if (status === "LoadingFirstPage") return <LibrarySkeleton label={ar ? "جارٍ تحميل الأرشيف..." : "Loading archive..."} view="list" count={4} />;
  if (title && !rows.length && status !== "CanLoadMore") return null;
  return <section className="space-y-4">
    {title && <h2 className="ws-section-title mb-3">{title}</h2>}
    {!rows.length ? <div className="ws-empty ws-page"><span className="ws-empty__art"><Archive size={24} aria-hidden /></span><h2>{ar ? "لا شيء مؤرشف" : "Nothing archived"}</h2><p>{ar ? "أرشِف من قائمة «…» في المكتبة، وسيبقى هنا حتى تستعيده." : "Archive from the “…” menu in the library. It waits here until you restore it."}</p></div>
      : <div className="ws-table-wrap ws-page"><table className="ws-table"><thead><tr><th>{ar ? "الاسم" : "Name"}</th>{kind !== "legacy_quizzes" && <th>{kind === "courses" ? ar ? "الدروس" : "Lessons" : kind === "lessons" ? ar ? "الكتل" : "Blocks" : ar ? "البطاقات" : "Cards"}</th>}<th>{ar ? "آخر تعديل" : "Edited"}</th><th>{ar ? "الإجراءات" : "Actions"}</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.id}><td><span className="font-medium" dir="auto">{row.title || (ar ? "بلا عنوان" : "Untitled")}</span></td>{kind !== "legacy_quizzes" && <td className="ws-num">{row.count}</td>}<td className="text-muted-foreground">{timeAgo(locale, row.updatedAt)}</td><td><button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" aria-label={`${restoreLabel} ${row.title}`} disabled={pending !== null} onClick={() => void run(row)}><ArchiveRestore size={15} aria-hidden />{pending === row.id ? ar ? "جارٍ الاستعادة..." : "Restoring..." : restoreLabel}</button></td></tr>)}
      </tbody></table></div>}
    {(status === "CanLoadMore" || status === "LoadingMore") && <button type="button" className="ws-btn" disabled={status === "LoadingMore" || pending !== null} onClick={() => loadMore(25)}>{status === "LoadingMore" ? ar ? "جارٍ التحميل..." : "Loading..." : ar ? "حمّل المزيد" : "Load more"}</button>}
  </section>;
}
