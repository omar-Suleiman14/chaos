"use client";

import { ChaosSelect } from "@/components/workspace/ChaosSelect";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SignInButton, useAuth } from "@/lib/auth/client";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Answers, Language } from "@/convex/formLogic";
import FormRenderer, { themeClass, themeStyle, type UploadedFile } from "../FormRenderer";
import { formatDateTime, useCopy, useLocale } from "@/lib/i18n";
import QueryErrorBoundary from "../QueryErrorBoundary";
import AttemptHistory from "./AttemptHistory";
import { homeworkCopy, homeworkError } from "./copy";

type Delivery = FunctionReturnType<typeof api.homework.getAttemptDefinition>;
type Receipt = FunctionReturnType<typeof api.homework.submitAttempt>;

export default function HomeworkStudent({ assignmentId }: { assignmentId: Id<"homeworkAssignments"> }) {
  const t = useCopy(homeworkCopy);
  const { isAuthenticated, isLoading } = useConvexAuth();
  return <main className="workspace-ui max-w-4xl mx-auto p-5 sm:p-8 grid gap-5"><Link href="/" className="ws-link-quiet">{t.backHome}</Link>
    {isLoading ? <p role="status">{t.loading}</p> : !isAuthenticated ? <section className="kb-card-bordered p-6 grid gap-3"><h1 className="ws-page-title">{t.signIn}</h1><p>{t.signInHelp}</p><SignInButton mode="modal"><button className="ws-btn w-fit">{t.signIn}</button></SignInButton></section> : <QueryErrorBoundary key={assignmentId}><StudentAttempt assignmentId={assignmentId} /></QueryErrorBoundary>}
  </main>;
}

function StudentAttempt({ assignmentId }: { assignmentId: Id<"homeworkAssignments"> }) {
  const t = useCopy(homeworkCopy), { locale } = useLocale();
  const convex = useConvex(), { getToken } = useAuth();
  const progress = useQuery(api.homework.myProgress, { assignmentId });
  const start = useMutation(api.homework.startAttempt), submit = useMutation(api.homework.submitAttempt), upload = useMutation(api.homework.generateUploadUrl);
  const [delivery, setDelivery] = useState<Delivery | null>(null), [receipt, setReceipt] = useState<Receipt | null>(null);
  const [answers, setAnswers] = useState<Answers>({}), [files, setFiles] = useState<Record<string, UploadedFile>>({});
  const [language, setLanguage] = useState<Language>(locale);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [receivedAt, setReceivedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const serverNow = () => delivery ? delivery.serverTime + Date.now() - receivedAt : Date.now();
  const expired = !!delivery && delivery.serverTime + now - receivedAt > delivery.deadline;
  const recorded = delivery ? progress?.find(row => row.number === delivery.attemptNumber && row.submittedAt !== null) : undefined;
  const finished = receipt ?? recorded;

  async function load(attemptId: Id<"homeworkAttempts">) {
    const result = await convex.query(api.homework.getAttemptDefinition, { attemptId });
    const stamp = Date.now(); setReceivedAt(stamp); setNow(stamp); setDelivery(result);
    const allowed = new Set(result.definition.fields.map(field => field.id));
    setAnswers(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => allowed.has(id))));
    setLanguage(previous => result.definition.languages.includes(previous) ? previous : result.definition.defaultLanguage);
  }
  async function run(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await work(); } catch (e) { setError(homeworkError(e, t)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <>
    <header><h1 className="ws-page-title">{delivery?.title ?? t.title}</h1>{delivery && <p className="ws-page-subtitle">{t.due}: {formatDateTime(locale, delivery.deadline)} · {t.remaining}: {delivery.attemptsRemaining}</p>}</header>
    {error && <p role="alert" className="ws-error">{error}</p>}
    {finished ? <section role="status" className="kb-card-bordered p-6"><h2 className="text-xl font-semibold">{t.done}</h2><p>{t.score}: {finished.score} / {finished.maxScore}</p></section> : !delivery ? <button className="ws-btn w-fit" disabled={busy} onClick={() => void run(async () => { const attemptId = await start({ assignmentId }); await load(attemptId); })}>{busy ? t.busy : t.start}</button> : <>
      {expired && <p role="status">{t.expired}</p>}
      <div className="flex gap-3 flex-wrap items-end"><label className="grid gap-1">{t.language}<ChaosSelect className="kb-input" value={language} disabled={busy || expired} onChange={e => setLanguage(e.target.value as Language)}>{delivery.definition.languages.map(value => <option key={value} value={value}>{value === "ar" ? "العربية" : "English"}</option>)}</ChaosSelect></label><button className="ws-btn" disabled={busy || expired} onClick={() => void run(() => load(delivery.attemptId))}>{t.refresh}</button></div>
      <p className="ws-muted">{t.refreshHelp}</p>
      {!delivery.definition.fields.length ? <p role="status">{t.noQuestions}</p> : <fieldset disabled={busy || expired} className="min-w-0"><div className={`ws-respondent-preview ${themeClass(delivery.definition)}`} style={themeStyle(delivery.definition)}><FormRenderer definition={delivery.definition} language={language} answers={answers} files={files} skipCover submitting={busy} submitLabel={t.submit}
        onAnswer={(id, value) => setAnswers(previous => { const next = { ...previous }; if (value === undefined) delete next[id]; else next[id] = value; return next; })}
        onSubmit={() => void run(async () => { if (serverNow() > delivery.deadline) { setError(t.expired); return; } setReceipt(await submit({ attemptId: delivery.attemptId, answers, language })); })}
        uploadFile={async (field, file) => {
          if (serverNow() > delivery.deadline) throw new Error(t.expired);
          if (!file.size || file.size > 10 * 1024 * 1024) throw new Error(t.fileSize);
          const token = await getToken({ template: "convex" });
          if (!token) throw new Error(t.signInHelp);
          const url = await upload({ attemptId: delivery.attemptId, fieldId: field.id });
          const response = await fetch(`${url}&name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", Authorization: `Bearer ${token}` }, body: file });
          const body: unknown = await response.json().catch(() => null);
          if (!response.ok || !body || typeof body !== "object" || !("uploadId" in body) || typeof body.uploadId !== "string" || !("name" in body) || typeof body.name !== "string" || !("size" in body) || typeof body.size !== "number") throw new Error(t.upload);
          const info = { uploadId: body.uploadId, name: body.name, size: body.size };
          setFiles(previous => ({ ...previous, [info.uploadId]: info })); return info;
        }} /></div></fieldset>}
    </>}
    <AttemptHistory rows={progress} />
    {finished && <button className="ws-btn w-fit" disabled={busy} onClick={() => void run(async () => { const attemptId = await start({ assignmentId }); setAnswers({}); setFiles({}); await load(attemptId); setReceipt(null); })}>{busy ? t.busy : t.start}</button>}
  </>;
}
