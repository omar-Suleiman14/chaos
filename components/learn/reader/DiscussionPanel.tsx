"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { CheckCircle2, CornerDownRight, Flag, MessageSquare, RotateCcw, Trash2, X } from "lucide-react";
import { useLearnActions, useLearnViewer, useThreads } from "@/lib/learn/data";
import type { DiscussionThread, Lesson } from "@/lib/learn/types";
import { useCopy, useLocale } from "@/lib/i18n";
import { timeAgo } from "@/lib/timeAgo";
import { jumpTo } from "./Outline";
import ReportDialog from "./ReportDialog";

const copy = {
  en: {
    title: "Discussion", close: "Close discussion", lead: "Questions and corrections about this lesson. Keep it about the material.",
    filter: { open: "Open", resolved: "Resolved", all: "All" }, empty: "No discussion yet. Select text and choose Discuss to ask about a specific part.",
    newTitle: "Ask or comment on the whole lesson", about: "About:", placeholder: "Write a question or correction…", post: "Post", reply: "Reply", replyPh: "Reply…",
    resolve: "Mark resolved", reopen: "Reopen", report: "Report", delete: "Delete", removed: "Comment removed.", jump: "Show in lesson", owner: "Author",
    signIn: "Sign in to join the discussion.", anchorRemoved: "That part of the lesson has changed.",
  },
  ar: {
    title: "النقاش", close: "إغلاق النقاش", lead: "أسئلة وتصحيحات حول هذا الدرس. اجعلها عن المادة.",
    filter: { open: "مفتوحة", resolved: "محلولة", all: "الكل" }, empty: "لا نقاش بعد. حدّد نصًا واختر «ناقش» لتسأل عن جزء محدد.",
    newTitle: "اسأل أو علّق على الدرس كله", about: "عن:", placeholder: "اكتب سؤالًا أو تصحيحًا…", post: "انشر", reply: "ردّ", replyPh: "ردّ…",
    resolve: "علّم كمحلول", reopen: "أعد الفتح", report: "إبلاغ", delete: "حذف", removed: "حُذف التعليق.", jump: "اعرضه في الدرس", owner: "الكاتب",
    signIn: "سجّل الدخول للمشاركة في النقاش.", anchorRemoved: "تغيّر هذا الجزء من الدرس.",
  },
};

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Styled button radios preserve native button activation and expose their selection to assistive technology. */
export default function DiscussionPanel({ lesson, draftAnchor, onClearAnchor, onClose, blockExists }: {
  lesson: Lesson; draftAnchor?: { blockId: string; excerpt: string }; onClearAnchor: () => void; onClose: () => void; blockExists: (id: string) => boolean;
}) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const viewer = useLearnViewer();
  const threads = useThreads(lesson.id) ?? [];
  const actions = useLearnActions();
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [body, setBody] = useState("");
  const [reporting, setReporting] = useState<{ id: string; title: string } | null>(null);
  const shown = threads.filter((th) => filter === "all" || (filter === "resolved") === th.resolved);
  const signedIn = !!viewer?.signedIn;

  const post = async () => {
    try {
      await actions.startThread({ lessonId: lesson.id, blockId: draftAnchor?.blockId, anchorExcerpt: draftAnchor?.excerpt, body });
      setBody("");
      onClearAnchor();
      setFilter("open");
    } catch (err) { toast.error(err); }
  };

  return (
    <section className="lx-sidepanel" aria-label={t.title}>
      <header className="lx-sidepanel__head">
        <h2><MessageSquare size={16} aria-hidden />{t.title}</h2>
        <button type="button" className="ws-icon-button" onClick={onClose} aria-label={t.close}><X size={16} /></button>
      </header>
      <div className="lx-sidepanel__body">
        <p className="lx-help" style={{ fontSize: 12.5 }}>{t.lead}</p>
        <div className="lx-chips" role="radiogroup" aria-label={t.title}>
          {(["open", "resolved", "all"] as const).map((f) => <button key={f} type="button" role="radio" aria-checked={filter === f} className="lx-chip" onClick={() => setFilter(f)}>{t.filter[f]} ({threads.filter((th) => f === "all" || (f === "resolved") === th.resolved).length})</button>)}
        </div>
        {!shown.length && <p className="lx-muted">{t.empty}</p>}
        {shown.map((th) => <Thread key={th.id} thread={th} lesson={lesson} viewerId={viewer?.id} signedIn={signedIn} locale={locale} t={t} blockExists={blockExists} onReport={(id, title) => setReporting({ id, title })} />)}
      </div>
      <form className="lx-sidepanel__foot" onSubmit={(e) => { e.preventDefault(); void post(); }}>
        {signedIn ? (
          <>
            {draftAnchor ? (
              <div className="lx-panel__row" style={{ alignItems: "flex-start" }}>
                <div className="lx-quote" style={{ flex: 1 }}><strong style={{ fontSize: 11 }}>{t.about}</strong> {draftAnchor.excerpt}</div>
                <button type="button" className="ws-icon-button" onClick={onClearAnchor} aria-label={t.close}><X size={14} /></button>
              </div>
            ) : <span className="lx-muted">{t.newTitle}</span>}
            <textarea className="lx-textarea" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t.placeholder} aria-label={t.placeholder} maxLength={4000} />
            <div className="lx-actions" style={{ justifyContent: "flex-end" }}><button type="submit" className="ws-btn ws-btn--primary ws-btn--sm" disabled={!body.trim()}>{t.post}</button></div>
          </>
        ) : <span className="lx-muted">{t.signIn}</span>}
      </form>
      {reporting && <ReportDialog target={{ kind: "comment", id: reporting.id }} title={reporting.title} onClose={() => setReporting(null)} />}
    </section>
  );
}
/* oxlint-enable jsx-a11y/prefer-tag-over-role */

function Thread({ thread, lesson, viewerId, signedIn, locale, t, blockExists, onReport }: {
  thread: DiscussionThread; lesson: Lesson; viewerId?: string; signedIn: boolean; locale: "en" | "ar"; t: (typeof copy)["en"];
  blockExists: (id: string) => boolean; onReport: (id: string, title: string) => void;
}) {
  const actions = useLearnActions();
  const [reply, setReply] = useState("");
  const [failed, setFailed] = useState("");
  const run = (work: Promise<unknown>) => { setFailed(""); work.catch((err) => setFailed(err instanceof Error ? err.message : String(err))); };
  const canResolve = viewerId === lesson.ownerId || viewerId === thread.comments[0]?.authorId;
  return (
    <article className="lx-thread" data-resolved={thread.resolved}>
      {thread.anchorExcerpt && (
        <div style={{ display: "grid", gap: 4 }}>
          <div className="lx-quote">{thread.anchorExcerpt}</div>
          {thread.blockId && (blockExists(thread.blockId)
            ? <button type="button" className="lx-link" style={{ justifySelf: "start" }} onClick={() => jumpTo(thread.blockId!)}>{t.jump}</button>
            : <span className="lx-muted">{t.anchorRemoved}</span>)}
        </div>
      )}
      {thread.comments.map((c, i) => (
        <div key={c.id} className="lx-comment" style={i ? { paddingInlineStart: 14 } : undefined}>
          <header>
            {i > 0 && <CornerDownRight size={12} aria-hidden />}
            <strong>{c.authorName}</strong>
            {c.authorId === lesson.ownerId && <span className="lx-badge" data-tone="blue">{t.owner}</span>}
            <span>{timeAgo(locale, c.createdAt)}</span>
            <span style={{ marginInlineStart: "auto", display: "flex", gap: 2 }}>
              {signedIn && c.moderation !== "removed" && c.authorId !== viewerId && <button type="button" className="ws-icon-button" onClick={() => onReport(c.id, c.body.slice(0, 40))} aria-label={t.report}><Flag size={13} /></button>}
              {c.authorId === viewerId && c.moderation !== "removed" && <button type="button" className="ws-icon-button" onClick={() => run(actions.deleteComment(thread.id, c.id))} aria-label={t.delete}><Trash2 size={13} /></button>}
            </span>
          </header>
          {c.moderation === "removed" ? <em className="lx-muted">{t.removed}</em> : <p style={{ whiteSpace: "pre-wrap" }}>{c.body}</p>}
        </div>
      ))}
      <div className="lx-actions">
        {signedIn && !thread.resolved && (
          <form style={{ display: "flex", gap: 6, flex: 1 }} onSubmit={(e) => { e.preventDefault(); if (reply.trim()) { run(actions.reply(thread.id, reply)); setReply(""); } }}>
            <input className="lx-input" style={{ minHeight: 32, padding: "4px 8px" }} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t.replyPh} aria-label={t.reply} maxLength={4000} />
            <button type="submit" className="ws-btn ws-btn--sm" disabled={!reply.trim()}>{t.reply}</button>
          </form>
        )}
        {canResolve && (
          <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" onClick={() => run(actions.resolveThread(thread.id, !thread.resolved))}>
            {thread.resolved ? <RotateCcw size={14} aria-hidden /> : <CheckCircle2 size={14} aria-hidden />}{thread.resolved ? t.reopen : t.resolve}
          </button>
        )}
      </div>
      {failed && <p className="lx-error" role="alert">{failed}</p>}
    </article>
  );
}
