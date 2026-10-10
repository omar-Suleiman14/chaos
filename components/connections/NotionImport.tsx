"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { NotionMark } from "@/components/site/marks";
import { Select } from "@/components/workspace/Select";
import { errorMessage } from "@/lib/errors";
import { useCopy } from "@/lib/i18n";
import { toast } from "@/lib/toast";

const copy = {
  en: {
    open: "Import from Notion", page: "Notion page", choose: "Choose a page", loading: "Loading your Notion pages…",
    import: "Import", importing: "Importing…", cancel: "Cancel", error: "Could not load your Notion pages. Try again.",
    empty: "No pages are shared with Chaos yet. In Notion, open a page, choose Connections and add Chaos.",
    connect: "Connect Notion to import pages", skipped: "Imported. Some unsupported blocks were skipped.", done: "Imported as a lesson draft.",
  },
  ar: {
    open: "استيراد من Notion", page: "صفحة Notion", choose: "اختر صفحة", loading: "جارٍ تحميل صفحات Notion…",
    import: "استيراد", importing: "جارٍ الاستيراد…", cancel: "إلغاء", error: "تعذر تحميل صفحات Notion. حاول مجددًا.",
    empty: "لا توجد صفحات مشتركة مع Chaos بعد. افتح صفحة في Notion، واختر Connections وأضف Chaos.",
    connect: "اربط Notion لاستيراد الصفحات", skipped: "تم الاستيراد مع تجاهل بعض الكتل غير المدعومة.", done: "تم الاستيراد كمسودة درس.",
  },
};

export type NotionPage = { id: string; title: string };

/** Pages shared with the Chaos integration, loaded once when the picker opens. */
function useNotionPages() {
  const listPages = useAction(api.notion.listPages);
  const [pages, setPages] = useState<NotionPage[] | null>(null);
  /** null while fine; otherwise the readable reason, which may be empty (show a generic line then). */
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    listPages({}).then((rows) => { if (live) setPages(rows); }, (err) => { if (live) setFailed(errorMessage(err, "")); });
    return () => { live = false; };
  }, [listPages]);
  return { pages, failed };
}

/** The workspace dropdown of Notion pages; pages carry no other detail worth a second line. */
export function NotionPageSelect({ pages, value, onChange, disabled }: { pages: NotionPage[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const t = useCopy(copy);
  return <Select label={t.page} placeholder={t.choose} className="w-full" disabled={disabled} value={value} onChange={onChange}
    options={pages.map((page) => ({ value: page.id, label: page.title }))} />;
}

/**
 * "Import from Notion" in the course builder: the page becomes a lesson draft in this course
 * (and module), then opens in the editor like a new lesson. Hidden where Notion isn't set up.
 */
export function CourseNotionImport({ courseId, moduleId, disabled }: { courseId: Id<"learnCollections">; moduleId?: string; disabled?: boolean }) {
  const t = useCopy(copy);
  const available = useQuery(api.notion.available);
  const { isAuthenticated } = useConvexAuth();
  const connection = useQuery(api.notion.connection, isAuthenticated ? {} : "skip");
  const [open, setOpen] = useState(false);
  if (!available || connection === undefined) return null;
  if (!connection) return <Link className="cb-add w-full" href="/dashboard/connections"><NotionMark size={16} /> {t.connect}</Link>;
  if (!open) return <button type="button" className="cb-add w-full" disabled={disabled} onClick={() => setOpen(true)}><NotionMark size={16} /> {t.open}</button>;
  return <NotionImportPanel courseId={courseId} moduleId={moduleId} onClose={() => setOpen(false)} />;
}

function NotionImportPanel({ courseId, moduleId, onClose }: { courseId: Id<"learnCollections">; moduleId?: string; onClose: () => void }) {
  const t = useCopy(copy), router = useRouter();
  const importPage = useAction(api.notion.importPage);
  const { pages, failed } = useNotionPages();
  const [pageId, setPageId] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { lessonId, skipped } = await importPage({ pageId, courseId, ...(moduleId ? { moduleId } : {}) });
      toast.success(skipped ? t.skipped : t.done);
      router.push(`/dashboard/learn/lessons/${lessonId}?course=${courseId}`);
    } catch (err) { toast.error(err); setBusy(false); }
  };
  return (
    <fieldset className="cb-notion" aria-label={t.open}>
      <span className="cb-notion__mark" aria-hidden><NotionMark size={16} /></span>
      {failed !== null ? <p className="cb-note" role="alert">{failed || t.error}</p>
        : pages === null ? <p className="cb-note">{t.loading}</p>
        : pages.length === 0 ? <p className="cb-note">{t.empty}</p>
        : <div className="cb-notion__pick"><NotionPageSelect pages={pages} value={pageId} onChange={setPageId} disabled={busy} /></div>}
      <div className="cb-notion__actions">
        <button type="button" className="ws-btn ws-btn--primary ws-btn--sm" disabled={!pageId || busy} onClick={() => void run()}>{busy ? t.importing : t.import}</button>
        <button type="button" className="ws-btn ws-btn--ghost ws-btn--sm" disabled={busy} onClick={onClose}>{t.cancel}</button>
      </div>
    </fieldset>
  );
}
