"use client";

import { useEffect, useState } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowUpRight } from "lucide-react";
import { NotionMark } from "@/components/site/marks";
import { useCopy, useLocale } from "@/lib/i18n";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/errors";
import type { Id } from "@/convex/_generated/dataModel";
import { Select } from "@/components/workspace/Select";
import { NotionPageSelect } from "@/components/connections/NotionImport";

const copy = {
  en: {
    title: "Apps", lead: "Use Chaos with the tools you already have.",
    max: { name: "Max", body: "Turn a Max page into a Chaos draft to review. Only summaries go back to Max.", action: "Get Max" },
    notion: {
      name: "Notion", body: "Import Notion pages as private lesson drafts, or send quiz scores and completed form responses to a Notion database.",
      connect: "Connect Notion", connected: "Connected workspace", disconnect: "Disconnect",
      loadPages: "Choose a page to import", importPage: "Import as lesson draft", choosePage: "Choose a Notion page",
      loadDatabases: "Choose a results database", chooseDatabase: "Choose a database", enableSync: "Sync results here",
      disableSync: "Stop results sync", syncing: "Sending results to", success: "Lesson draft created. Open in Chaos",
      course: "Course", chooseCourse: "Choose a course", newCourse: "New course", newCourseHint: "Named after the page",
      skipped: "Some unsupported blocks were skipped.", empty: "Nothing shared yet. Share pages or databases with the Chaos integration in Notion.",
      loading: "Working…", error: "Could not complete that action. Try again.",
      privacy: "Only scores and submission details are sent; individual answers and respondent names stay in Chaos.",
      soon: "Coming soon",
      returned: { connected: "Notion is connected.", denied: "Notion access was not granted.", failed: "Could not connect Notion. Try again." },
    },
  },
  ar: {
    title: "التطبيقات", lead: "استخدم Chaos مع الأدوات التي لديك.",
    max: { name: "Max", body: "حوّل صفحة من Max إلى مسودة في Chaos لتراجعها. لا يعود إلى Max سوى الملخصات.", action: "احصل على Max" },
    notion: {
      name: "Notion", body: "استورد صفحات Notion كمسودات دروس خاصة، أو أرسل درجات الاختبارات وإكمال النماذج إلى قاعدة بيانات Notion.",
      connect: "ربط Notion", connected: "مساحة العمل المتصلة", disconnect: "فصل الاتصال",
      loadPages: "اختر صفحة لاستيرادها", importPage: "استيراد كمسودة درس", choosePage: "اختر صفحة من Notion",
      loadDatabases: "اختر قاعدة بيانات للنتائج", chooseDatabase: "اختر قاعدة بيانات", enableSync: "مزامنة النتائج هنا",
      disableSync: "إيقاف مزامنة النتائج", syncing: "إرسال النتائج إلى", success: "تم إنشاء مسودة الدرس. افتحها في Chaos",
      course: "الدورة", chooseCourse: "اختر دورة", newCourse: "دورة جديدة", newCourseHint: "باسم الصفحة",
      skipped: "تم تجاهل بعض الكتل غير المدعومة.", empty: "لا توجد عناصر مشتركة بعد. شارك الصفحات أو قواعد البيانات مع Chaos في Notion.",
      loading: "جارٍ العمل…", error: "تعذر إتمام الإجراء. حاول مجددًا.",
      privacy: "تُرسل الدرجات وبيانات الإرسال فقط، وتبقى الإجابات الفردية وأسماء المشاركين في Chaos.",
      soon: "قريبًا",
      returned: { connected: "تم ربط Notion.", denied: "لم يُمنح الوصول إلى Notion.", failed: "تعذر ربط Notion. حاول مجددًا." },
    },
  },
};
type Item = { id: string; title: string; url?: string };
/** Course choice that creates a course named after the page; never a real document id. */
const NEW_COURSE = "new";
type Returned = keyof typeof copy.en.notion.returned;

export default function ConnectedApps() {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const available = useQuery(api.notion.available);
  const { isAuthenticated } = useConvexAuth();
  // Wait for sign-in: before it, "not connected" would be a guess and would offer Connect.
  const status = useQuery(api.notion.connection, isAuthenticated ? {} : "skip");
  const connect = useMutation(api.notion.beginConnect);
  const disconnect = useMutation(api.notion.disconnect);
  const getPages = useAction(api.notion.listPages);
  const getDataSources = useAction(api.notion.listDataSources);
  const importPage = useAction(api.notion.importPage);
  const chooseDataSource = useAction(api.notion.chooseDataSource);
  const disableSync = useMutation(api.notion.disableResultSync);
  const createCourse = useMutation(api.courses.create);
  const [pages, setPages] = useState<Item[] | null>(null);
  const [sources, setSources] = useState<Item[] | null>(null);
  const [pageId, setPageId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [courseId, setCourseId] = useState("");
  // Lessons live in courses (there is no standalone lesson list), so an import always names one.
  const courses = useQuery(api.courses.listMine, isAuthenticated && pages !== null ? {} : "skip");
  const [imported, setImported] = useState<{ lessonId: string; courseId: string } | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [returned, setReturned] = useState<Returned | null>(null);

  // The OAuth callback lands here with ?notion=connected|denied|failed; show it once, then drop it from the URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get("notion");
    if (value !== "connected" && value !== "denied" && value !== "failed") return;
    setReturned(value);
    url.searchParams.delete("notion");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  const act = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await operation(); } catch (err) { setError(errorMessage(err, t.notion.error)); }
    finally { setBusy(false); }
  };

  return (
    <section aria-labelledby="apps-title" className="cx-apps">
      <h2 id="apps-title" className="cx-apps__title">{t.title}</h2>
      <p className="cx-apps__lead">{t.lead}</p>
      <div className="cx-apps__grid">
        <article className="cx-app">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="cx-app__mark cx-app__mark--max"><img src="/max-mark.png" alt="" width={22} height={22} /></span>
          <h3>{t.max.name}</h3>
          <p>{t.max.body}</p>
          <a className="ws-btn ws-btn--sm" href="https://trymaxnow.vercel.app" target="_blank" rel="noreferrer">{t.max.action} <ArrowUpRight size={14} aria-hidden /></a>
        </article>
        {available === false ? (
        <article className="cx-app cx-app--soon" aria-label={`${t.notion.name}: ${t.notion.soon}`}>
          <span className="cx-app__mark" aria-hidden><NotionMark size={20} /></span>
          <h3>{t.notion.name}</h3>
          <span className="ws-pill">{t.notion.soon}</span>
        </article>
        ) : (
        <article className="cx-app">
          <span className="cx-app__mark" aria-hidden><NotionMark size={20} /></span>
          <h3>{t.notion.name}</h3>
          <p>{t.notion.body}</p>
          {returned && <output className={returned === "connected" ? "block text-sm" : "block text-sm text-red-600"}>{t.notion.returned[returned]}</output>}
          {available === undefined ? <p>{t.notion.loading}</p> : status === null ? (
            <button className="ws-btn ws-btn--sm" disabled={busy} onClick={() => void act(async () => {
              const url = await connect({ locale: locale === "ar" ? "ar" : "en" });
              window.location.assign(url);
            })}>{busy ? t.notion.loading : t.notion.connect}</button>
          ) : status ? (
            <div className="flex flex-col gap-3">
              <p><strong>{t.notion.connected}:</strong> {status.workspaceName}</p>
              <button className="ws-btn ws-btn--sm" disabled={busy} onClick={() => void act(async () => { setPages(await getPages({})); })}>{t.notion.loadPages}</button>
              {pages !== null && <>
                {pages.length ? <>
                  <NotionPageSelect pages={pages} value={pageId} onChange={setPageId} disabled={busy} />
                  <Select label={t.notion.course} placeholder={t.notion.chooseCourse} className="w-full" disabled={busy || courses === undefined} value={courseId} onChange={setCourseId}
                    options={[...(courses ?? []).filter((c) => !c.archived).map((c) => ({ value: c.id as string, label: c.title })), { value: NEW_COURSE, label: t.notion.newCourse, description: t.notion.newCourseHint }]} />
                  <button className="ws-btn ws-btn--primary ws-btn--sm" disabled={!pageId || !courseId || busy} onClick={() => void act(async () => {
                    const page = pages.find((p) => p.id === pageId);
                    const target = courseId === NEW_COURSE ? await createCourse({ title: page?.title ?? "", language: locale }) : courseId as Id<"learnCollections">;
                    const result = await importPage({ pageId, courseId: target });
                    setCourseId(target); setImported({ lessonId: result.lessonId, courseId: target }); setSkipped(result.skipped > 0);
                  })}>{t.notion.importPage}</button>
                </> : <p>{t.notion.empty}</p>}
              </>}
              {imported && <p><a className="underline" href={`/${locale}/dashboard/learn/lessons/${imported.lessonId}?course=${imported.courseId}`}>{t.notion.success}</a>{skipped ? ` ${t.notion.skipped}` : ""}</p>}
              <button className="ws-btn ws-btn--sm" disabled={busy} onClick={() => void act(async () => { setSources(await getDataSources({})); })}>{t.notion.loadDatabases}</button>
              {sources !== null && <>
                {sources.length ? <>
                  <Select label={t.notion.chooseDatabase} placeholder={t.notion.chooseDatabase} className="w-full" disabled={busy} value={sourceId} onChange={setSourceId}
                    options={sources.map((source) => ({ value: source.id, label: source.title }))} />
                  <button className="ws-btn ws-btn--sm" disabled={!sourceId || busy} onClick={() => void act(async () => { await chooseDataSource({ id: sourceId }); })}>{t.notion.enableSync}</button>
                </> : <p>{t.notion.empty}</p>}
              </>}
              {status.dataSourceId && <p>{t.notion.syncing}: {status.dataSourceTitle} <button className="underline" disabled={busy} onClick={() => void act(async () => { await disableSync({}); })}>{t.notion.disableSync}</button></p>}
              <p className="text-xs opacity-70">{t.notion.privacy}</p>
              <button className="ws-btn ws-btn--sm" disabled={busy} onClick={() => void act(async () => { await disconnect({}); setPages(null); setSources(null); setImported(null); })}>{t.notion.disconnect}</button>
            </div>
          ) : <p>{t.notion.loading}</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </article>
        )}
      </div>
    </section>
  );
}
