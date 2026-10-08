"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { deleteFormLocally, setFormStatusLocally, useOptimisticMutation } from "@/lib/optimistic";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LibrarySkeleton } from "@/components/workspace/Skeletons";
import { WsDialog, WsMenu, WsTabs } from "@/components/workspace/primitives";
import { toast } from "@/lib/toast";
import LearningArchive from "@/components/library/LearningArchive";
import { formatNumber, pluralForm, useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import { useConfirmed } from "@/lib/confirmedQuery";

const copy = {
  en: {
    title: "Archive", subtitle: "Archived forms are hidden from your library and closed to answers. Restore one to keep working, or delete it for good.",
    loading: "Loading archive...", nothing: "Nothing archived", nothingBody: "Archive a form from its “…” menu in the library. It waits here until you restore or delete it.", backToLibrary: "Back to library",
    name: "Name", responses: "Responses", archived: "Archived", actions: "Actions", untitled: "Untitled", restore: "Restore", deleteForever: "Delete forever",
    moreFor: (title: string) => `More for ${title}`,
    restoredToast: (title: string) => `Restored “${title}” to your library`, deletedToast: (title: string) => `Deleted “${title}”`,
    confirmTitle: (title: string) => `Delete “${title}” forever?`,
    confirmBody: (n: number) => `Its ${n} response${n === 1 ? "" : "s"}, uploaded files, versions and history are deleted too. This can’t be undone.`,
    cancel: "Cancel",
  },
  ar: {
    title: "الأرشيف", subtitle: "النماذج المؤرشفة مخفية من مكتبتك ومغلقة أمام الإجابات. استعد نموذجًا لتواصل العمل عليه، أو احذفه نهائيًا.",
    loading: "جارٍ تحميل الأرشيف...", nothing: "لا شيء مؤرشف", nothingBody: "أرشِف نموذجًا من قائمة «…» في المكتبة. يبقى هنا حتى تستعيده أو تحذفه.", backToLibrary: "العودة إلى المكتبة",
    name: "الاسم", responses: "الردود", archived: "تاريخ الأرشفة", actions: "الإجراءات", untitled: "بلا عنوان", restore: "استعادة", deleteForever: "احذف نهائيًا",
    moreFor: (title: string) => `المزيد لـ ${title}`,
    restoredToast: (title: string) => `تمت استعادة «${title}» إلى مكتبتك`, deletedToast: (title: string) => `تم حذف «${title}»`,
    confirmTitle: (title: string) => `حذف «${title}» نهائيًا؟`,
    confirmBody: (n: number) => `سيُحذف أيضًا ${n === 0 ? "ما فيه من" : pluralForm("ar", n, { one: "ردّه الواحد و", two: "ردّاه و", few: `${n} ردود و`, many: `${n} ردًّا و`, other: `${n} ردّ و` })}ملفات مرفوعة وإصدارات وسجل. لا يمكن التراجع عن ذلك.`,
    cancel: "إلغاء",
  },
};

type SortKey = "name" | "responses" | "archived";

/**
 * The only place a form can be deleted. Archiving (from the library) hides a
 * form and closes it to answers; from here it is restored or deleted for good.
 */
export default function ArchivePage() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const [tab, setTab] = useState<"forms" | "quizzes" | "courses" | "lessons" | "flashcards">("forms");
  return <div>
    <div className="ws-page-header"><div><h1 className="ws-page-title">{t.title}</h1><p className="ws-page-subtitle">{locale === "ar" ? "استعد المحتوى المؤرشف إلى مكتبتك. النماذج وحدها تدعم الحذف النهائي." : "Restore archived content to your library. Forms also support permanent deletion."}</p></div></div>
    <WsTabs tabs={["forms", "quizzes", "courses", "lessons", "flashcards"] as const} value={tab} onChange={setTab} label={locale === "ar" ? "أنواع المحتوى المؤرشف" : "Archived content types"}
      labels={locale === "ar" ? { forms: "النماذج", quizzes: "الاختبارات", courses: "الدورات", lessons: "الدروس", flashcards: "البطاقات" } : { forms: "Forms", quizzes: "Quizzes", courses: "Courses", lessons: "Lessons", flashcards: "Flashcards" }} />
    <div className="mt-6">{tab === "forms" ? <FormsArchive key={tab} quizzes={false} /> : tab === "quizzes" ? <FormsArchive key={tab} quizzes /> : <LearningArchive key={tab} kind={tab} />}</div>
  </div>;
}

function FormsArchive({ quizzes }: { quizzes: boolean }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(api.archive.list, isAuthenticated ? { kind: quizzes ? "quizzes" : "forms" } : "skip", { initialNumItems: 25 });
  // The device's copy shows until Convex answers (lib/confirmedQuery.ts).
  const forms = useConfirmed(`archive.list:${quizzes ? "quizzes" : "forms"}`, status === "LoadingFirstPage" ? undefined : { owned: results.map(row => ({ _id: row.id as Id<"forms">, title: row.title, responseCount: row.count, updatedAt: row.updatedAt, publishedVersion: row.published ? 1 : undefined, theme: { accent: row.accent ?? "#3595e3" } })) }).data;
  const setStatus = useOptimisticMutation(api.forms.setFormStatus, setFormStatusLocally);
  const deleteForm = useOptimisticMutation(api.forms.deleteForm, deleteFormLocally);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "archived", dir: "desc" });
  const [confirming, setConfirming] = useState<{ id: Id<"forms">; title: string; responses: number } | null>(null);

  const rows = useMemo(() => {
    const list = forms?.owned ?? [];
    const compare = {
      name: (a: (typeof list)[number], b: (typeof list)[number]) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base", numeric: true }),
      responses: (a: (typeof list)[number], b: (typeof list)[number]) => a.responseCount - b.responseCount,
      archived: (a: (typeof list)[number], b: (typeof list)[number]) => a.updatedAt - b.updatedAt,
    }[sort.key];
    return [...list].sort((a, b) => (sort.dir === "asc" ? 1 : -1) * compare(a, b));
  }, [forms, sort]);

  const restore = async (id: Id<"forms">, title: string, published: boolean) => {
    // The row leaves at once (optimistic update), so the toast follows the tap rather than the round trip.
    const toastId = toast.success(t.restoredToast(title), { undo: () => { setStatus({ formId: id, status: "archived" }).catch((e) => toast.error(e)); } });
    try {
      await setStatus({ formId: id, status: published ? "closed" : "draft" });
    } catch (e) {
      toast.error(e, { id: toastId });
    }
  };
  const remove = async () => {
    if (!confirming) return;
    const { id, title } = confirming;
    setConfirming(null);
    const toastId = toast.success(t.deletedToast(title));
    try {
      await deleteForm({ formId: id });
    } catch (e) {
      toast.error(e, { id: toastId });
    }
  };

  const header = (key: SortKey, label: string, numeric?: boolean) => (
    <th className={numeric ? "ws-num" : undefined} aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="ws-th-sort" data-active={sort.key === key}
        onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }))}>
        {label}{sort.key === key && (sort.dir === "asc" ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />)}
      </button>
    </th>
  );

  return (
    <div className="font-sans">

      {forms === undefined ? <LibrarySkeleton label={t.loading} view="list" count={4} /> :rows.length === 0 ? (
        <div className="ws-empty ws-page">
          <span className="ws-empty__art"><Archive size={24} /></span>
          <h2 className="text-xl font-semibold">{t.nothing}</h2>
          <p className="text-muted-foreground max-w-sm">{t.nothingBody}</p>
        </div>
      ) : (
        <div className="ws-table-wrap ws-page">
          <table className="ws-table">
            <thead>
              <tr>{header("name", t.name)}{header("responses", t.responses, true)}{header("archived", t.archived)}<th><span className="sr-only">{t.actions}</span></th></tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f._id}>
                  <td>
                    <Link href={`/dashboard/forms/${f._id}`} className="flex items-center gap-2.5 font-medium">
                      <span className="ws-recent-icon" aria-hidden="true" style={{ background: /^#[0-9a-f]{6}$/i.test(f.theme.accent) ? f.theme.accent : "var(--primary)", opacity: 0.6 }}>
                        {(f.title || "U").trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate">{f.title || t.untitled}</span>
                    </Link>
                  </td>
                  <td className="ws-num">{formatNumber(locale, f.responseCount)}</td>
                  <td className="text-muted-foreground">{timeAgo(locale, f.updatedAt)}</td>
                  <td>
                    <span className="flex items-center justify-end gap-1">
                      <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" onClick={() => void restore(f._id, f.title || t.untitled, f.publishedVersion !== undefined)}>
                        <ArchiveRestore size={15} /> {t.restore}
                      </button>
                      <WsMenu label={t.moreFor(f.title || t.untitled)}>
                        {(close) => (
                          <button type="button" role="menuitem" className="ws-menu__danger" onClick={() => { close(); setConfirming({ id: f._id, title: f.title || t.untitled, responses: f.responseCount }); }}>
                            <Trash2 size={14} /> {t.deleteForever}
                          </button>
                        )}
                      </WsMenu>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(status === "CanLoadMore" || status === "LoadingMore") && <button type="button" className="ws-btn mt-4" disabled={status === "LoadingMore"} onClick={() => loadMore(25)}>{status === "LoadingMore" ? t.loading : locale === "ar" ? "حمّل المزيد" : "Load more"}</button>}

      {confirming && (
        <WsDialog title={t.confirmTitle(confirming.title)} onClose={() => setConfirming(null)}>
          <p className="text-sm text-muted-foreground">
            {t.confirmBody(confirming.responses)}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="ws-btn ws-btn--ghost" onClick={() => setConfirming(null)}>{t.cancel}</button>
            <button type="button" className="ws-btn ws-btn--danger" onClick={() => void remove()}><Trash2 size={14} /> {t.deleteForever}</button>
          </div>
        </WsDialog>
      )}
    </div>
  );
}
