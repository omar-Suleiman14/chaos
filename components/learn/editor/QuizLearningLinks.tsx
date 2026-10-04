"use client";
import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocale } from "@/lib/i18n";
import { errorMessage } from "@/lib/errors";
import Link from "@/components/site/SiteLink";
import HostLiveButton from "@/components/live/HostLiveButton";
export default function QuizLearningLinks({ asset, title, published }: { asset: { kind: "form"; id: Id<"forms"> } | { kind: "quiz"; id: Id<"quizzes"> }; title: string; published: boolean }) {
 const { locale } = useLocale(), ar = locale === "ar";
 const lessons = usePaginatedQuery(api.lessons.listOwned, {}, { initialNumItems: 20 }), courses = useQuery(api.courses.listMine, {});
 const attach = useMutation(api.learnCollections.attachAssessment), add = useMutation(api.courses.addAssessment);
 const [lessonId, setLesson] = useState(""), [courseId, setCourse] = useState(""), [moduleId, setModule] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
 const course = useQuery(api.courses.get, courseId ? { courseId: courseId as Id<"learnCollections"> } : "skip");
 const run = async (fn: () => Promise<unknown>) => { setBusy(true); setMessage(""); try { await fn(); setMessage(ar ? "تم الإرفاق. انشر الدرس أو الدورة عندما تكون جاهزة." : "Attached. Publish the lesson or course when ready."); } catch(e) { setMessage(errorMessage(e)); } finally { setBusy(false); } };
 return <details className="lx-panel"><summary>{ar ? "استخدم في التعلّم" : "Use in Learn"}</summary><p className="lx-help">{ar ? "أرفق الاختبار الأصلي دون إنشاء نسخة." : "Attach the original quiz without creating a copy."}</p><div className="lx-form">
 <label>{ar ? "الدرس" : "Lesson"}<select value={lessonId} onChange={e => setLesson(e.target.value)}><option value="">{ar ? "اختر درسًا" : "Choose a lesson"}</option>{lessons.results.filter(l => l.status === "active").map(l => <option key={l._id} value={l._id}>{l.metadata.title}</option>)}</select></label>
 {lessons.status === "CanLoadMore" && <button className="ws-btn ws-btn--sm" type="button" onClick={() => lessons.loadMore(20)}>{ar ? "المزيد" : "Load more"}</button>}
 <button className="ws-btn" type="button" disabled={busy || !lessonId} onClick={() => void run(() => attach({ lessonId: lessonId as Id<"lessons">, asset, label: title.trim() || "Quiz", order: 1000 }))}>{ar ? "أرفق بالدرس" : "Attach to lesson"}</button>
 <label>{ar ? "الدورة" : "Course"}<select value={courseId} onChange={e => { setCourse(e.target.value); setModule(""); }}><option value="">{ar ? "اختر دورة" : "Choose a course"}</option>{courses?.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
 <label>{ar ? "التقييم" : "Assessment placement"}<select value={moduleId} onChange={e => setModule(e.target.value)}><option value="">{ar ? "التقييم النهائي" : "Final assessment"}</option>{course?.modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
 <button className="ws-btn" type="button" disabled={busy || !course} onClick={() => void run(() => add({ courseId: courseId as Id<"learnCollections">, asset, ...(moduleId ? { moduleId } : {}) }))}>{ar ? "أضف للدورة" : "Add to course"}</button>
 <div className="lx-actions">{asset.kind === "form" && published && <HostLiveButton formId={asset.id} onError={setMessage} />}<Link className="ws-btn" href={asset.kind === "form" ? `/dashboard/forms/${asset.id}/responses` : `/dashboard/results?quizId=${asset.id}`}>{ar ? "نتائج المتعلّمين" : "Learner results"}</Link></div>{message && <p role="status">{message}</p>}
 </div></details>;
}
