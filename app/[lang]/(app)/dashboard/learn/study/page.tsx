"use client";

import Link from "next/link";
import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { Infer } from "convex/values";
import type { Id } from "@/convex/_generated/dataModel";
import type { studyRequest } from "@/convex/studyLessonModel";
import {
  SOURCE_FILE_ACCEPT,
  useLearnMediaClient,
} from "@/lib/learn/mediaClient";
import { useLocale } from "@/lib/i18n";

type Job = {
  jobId: Id<"studyLessonJobs">;
  status: string;
  revision: number;
  lessonUrl: string | null;
  problems: string[];
  request: Infer<typeof studyRequest>;
  summary: { checkpoints: number; flashcardSets: number; cards: number };
  progress: { savedCheckpoints: number };
};
const build = makeFunctionReference<
  "mutation",
  { request: Infer<typeof studyRequest> },
  Job
>("studyLessons:build");
const list = makeFunctionReference<"query", Record<string, never>, Job[]>(
  "studyLessons:listJobs",
);
const get = makeFunctionReference<
  "query",
  { jobId: Id<"studyLessonJobs"> },
  Job
>("studyLessons:get");

export default function StudyLessonsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { isAuthenticated } = useConvexAuth();
  const media = useLearnMediaClient();
  const start = useMutation(build);
  const jobs = useQuery(list, isAuthenticated ? {} : "skip");
  const [selected, setSelected] = useState<Id<"studyLessonJobs"> | null>(null);
  const job = useQuery(
    get,
    isAuthenticated && selected ? { jobId: selected } : "skip",
  );
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceId, setSourceId] = useState<Id<"learnSources"> | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [publicCitation, setPublicCitation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  async function prepare(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      let id = sourceId;
      if (!id) {
        id = (
          await media.upload(file, { title: file.name, origin: file.name })
        ).slice("chaos-source:".length) as Id<"learnSources">;
        setSourceId(id);
      }
      if (publicCitation) {
        const source = await media.read(id);
        await media.saveSource({ ...source, metadataVisibility: "public" });
      }
      const stableKey = key ?? crypto.randomUUID();
      setKey(stableKey);
      const result = await start({
        request: {
          key: stableKey,
          title: title.trim(),
          sources: [{ sourceId: id, label: file.name }],
        },
      });
      setSelected(result.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function copyRequest() {
    if (!job) return;
    try {
      await navigator.clipboard.writeText(
        `Continue Chaos study lesson job ${job.jobId}. Read its complete sources including figures, tables and captions. Use create-study-lesson, resume saved checkpoints, and follow the stored teaching and publication preferences.`,
      );
      setCopied(true);
    } catch {
      setError(
        ar
          ? "تعذّر النسخ. استخدم رقم المهمة أدناه."
          : "Could not copy. Use the job ID below.",
      );
    }
  }
  const stateLabel = (state: string) =>
    ar
      ? ({
          collecting: "جارٍ إعداد المادة",
          draft: "مسودة",
          validation_failed: "يحتاج إلى إصلاح",
          published: "منشور",
        }[state] ?? state)
      : ({
          collecting: "Preparing material",
          draft: "Draft",
          validation_failed: "Needs fixes",
          published: "Published",
        }[state] ?? state);
  return (
    <div className="lx-page lx-page--narrow">
      <header className="lx-hero">
        <h1>{ar ? "درس للمذاكرة" : "Study lesson"}</h1>
        <p>
          {ar
            ? "ارفع المادة ثم اطلب من مساعدك تدريسها كاملة. يُحفظ التقدم لتتمكن من المتابعة."
            : "Upload your material, then ask your connected assistant to teach it in full. Your progress is saved so you can resume."}
        </p>
      </header>
      {!isAuthenticated ? (
        <p>{ar ? "سجّل الدخول لإعداد درس." : "Sign in to prepare a lesson."}</p>
      ) : (
        <>
          <form onSubmit={prepare} className="lx-section">
            <p>
              <label>
                {ar ? "عنوان الدرس" : "Lesson title"}
                <input
                  className="ws-input"
                  required
                  disabled={busy}
                  maxLength={200}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setKey(null);
                  }}
                />
              </label>
            </p>
            <p>
              <label>
                {ar ? "المادة التعليمية" : "Educational material"}
                <input
                  type="file"
                  accept={SOURCE_FILE_ACCEPT}
                  required
                  disabled={busy}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setSourceId(null);
                    setKey(null);
                  }}
                />
              </label>
            </p>
            <p>
              <label>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={publicCitation}
                  onChange={(e) => setPublicCitation(e.target.checked)}
                />{" "}
                {ar
                  ? "اسم المصدر وبيانات الاستشهاد متاحة للعامة؛ يبقى الملف خاصًا."
                  : "Allow the source title and citation details to be public; the file stays private."}
              </label>
            </p>
            <button
              className="ws-btn"
              disabled={busy || !file || !title.trim()}
            >
              {busy
                ? ar
                  ? "جارٍ الحفظ…"
                  : "Saving…"
                : ar
                  ? "إعداد الدرس"
                  : "Prepare lesson"}
            </button>
          </form>
          {error && <p role="alert">{error}</p>}
          {job && (
            <section className="lx-section" aria-live="polite">
              <h2>{job.request.title}</h2>
              <p>{stateLabel(job.status)}</p>
              <p>
                {ar
                  ? `تم حفظ ${job.progress.savedCheckpoints} خطوات`
                  : `${job.progress.savedCheckpoints} steps saved`}
              </p>
              {job.lessonUrl && (
                <p>
                  {ar
                    ? `${job.summary.checkpoints} اختبارات · ${job.summary.cards} بطاقة`
                    : `${job.summary.checkpoints} quiz checkpoints · ${job.summary.cards} flashcards`}
                </p>
              )}
              <p>
                {ar ? "رقم المهمة" : "Job ID"}: <code>{job.jobId}</code>
              </p>
              {job.status === "collecting" && (
                <>
                  <p>
                    {ar
                      ? "انسخ الطلب إلى ChatGPT أو Claude أو Codex بعد توصيل Chaos."
                      : "Copy this request to ChatGPT, Claude or Codex with Chaos connected."}
                  </p>
                  <button
                    type="button"
                    className="ws-btn"
                    onClick={() => void copyRequest()}
                  >
                    {copied
                      ? ar
                        ? "تم النسخ"
                        : "Copied"
                      : ar
                        ? "نسخ طلب المتابعة"
                        : "Copy continuation request"}
                  </button>
                </>
              )}
              {!!job.problems.length && (
                <ul>
                  {job.problems.map((problem, i) => (
                    <li key={i}>{problem}</li>
                  ))}
                </ul>
              )}
              {job.lessonUrl && (
                <Link className="ws-btn" href={job.lessonUrl}>
                  {ar ? "فتح الدرس" : "Open lesson"}
                </Link>
              )}
            </section>
          )}
          <section className="lx-section">
            <h2>{ar ? "الدروس المحفوظة" : "Saved study jobs"}</h2>
            {jobs === undefined ? (
              <p>{ar ? "جارٍ التحميل…" : "Loading…"}</p>
            ) : jobs.length ? (
              <ul>
                {jobs.map((j) => (
                  <li key={j.jobId}>
                    <button
                      type="button"
                      className="ws-btn ws-btn--sm"
                      onClick={() => {
                        setSelected(j.jobId);
                        setCopied(false);
                      }}
                    >
                      {j.request.title} · {stateLabel(j.status)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{ar ? "لا توجد مهام بعد." : "No study jobs yet."}</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
