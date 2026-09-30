"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, FileText, GraduationCap, Send, Sparkles, Trash2, X } from "lucide-react";
import { AiUnavailableError, learnAi } from "@/lib/learn/ai";
import { useLearnActions, useLearnCapabilities, useTutorThread } from "@/lib/learn/data";
import { excerpt } from "@/lib/learn/doc";
import type { Grounding, LessonSource } from "@/lib/learn/types";
import { useCopy } from "@/lib/i18n";
import { jumpTo } from "./Outline";

const copy = {
  en: {
    title: "Chaos Tutor", close: "Close tutor", clear: "Clear conversation", about: "Asks about this lesson. Answers mark what comes from the lesson or its sources, and what is extra explanation.",
    legend: { lesson: "From this lesson", source: "From a source", general: "Additional explanation" } as Record<Grounding, string>,
    placeholder: "Ask about this lesson…", ask: "Ask", about2: "About the selection", removeSel: "Remove selection",
    thinking: "Thinking…", failed: "The tutor could not answer. Try again.",
    off: "The Chaos Tutor needs the Learn AI service, which isn’t turned on for this Chaos. You can still ask an outside assistant; you choose what is shared.",
    chatgpt: "Ask ChatGPT", claude: "Ask Claude", jump: "Go to this part", noteGeneral: "Not from the lesson. Check it against your sources.",
  },
  ar: {
    title: "مدرّس Chaos", close: "إغلاق المدرّس", clear: "امسح المحادثة", about: "يجيب عن هذا الدرس. تميّز الإجابات ما جاء من الدرس أو مصادره عمّا هو شرح إضافي.",
    legend: { lesson: "من هذا الدرس", source: "من مصدر", general: "شرح إضافي" } as Record<Grounding, string>,
    placeholder: "اسأل عن هذا الدرس…", ask: "اسأل", about2: "عن التحديد", removeSel: "إزالة التحديد",
    thinking: "يفكّر…", failed: "تعذّر على المدرّس الإجابة. حاول مرة أخرى.",
    off: "يحتاج مدرّس Chaos إلى خدمة الذكاء الاصطناعي في Learn، وهي غير مفعّلة في Chaos هذا. يمكنك أن تسأل مساعدًا خارجيًا؛ وأنت تختار ما يُشارَك.",
    chatgpt: "اسأل ChatGPT", claude: "اسأل Claude", jump: "انتقل إلى هذا الجزء", noteGeneral: "ليس من الدرس. تحقّق منه في مصادرك.",
  },
};

const groundingIcon = { lesson: BookOpen, source: FileText, general: Sparkles } as const;

export default function TutorPanel({ lessonId, version, sources, selection, onClearSelection, onClose, onHandoff }: {
  lessonId: string; version?: number; sources: LessonSource[];
  selection?: { text: string; blockId: string }; onClearSelection: () => void; onClose: () => void;
  onHandoff: (target: "chatgpt" | "claude", question: string) => void;
}) {
  const t = useCopy(copy);
  const caps = useLearnCapabilities();
  const thread = useTutorThread(lessonId) ?? [];
  const actions = useLearnActions();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [thread.length, busy]);

  const ask = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setError("");
    actions.appendTutor(lessonId, { role: "user", parts: [{ text: q, grounding: "general" }], selection: selection?.text });
    setQuestion("");
    setBusy(true);
    try {
      const parts = await learnAi.tutor({ lessonId, version, question: q, selection: selection?.text, blockId: selection?.blockId, history: thread.map((m) => ({ role: m.role, text: m.parts.map((p) => p.text).join("\n") })) });
      actions.appendTutor(lessonId, { role: "tutor", parts });
    } catch (err) {
      setError(err instanceof AiUnavailableError ? t.off : t.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="lx-sidepanel" aria-label={t.title}>
      <header className="lx-sidepanel__head">
        <h2><GraduationCap size={16} aria-hidden />{t.title}</h2>
        {thread.length > 0 && <button type="button" className="ws-icon-button" onClick={() => actions.clearTutor(lessonId)} aria-label={t.clear}><Trash2 size={15} /></button>}
        <button type="button" className="ws-icon-button" onClick={onClose} aria-label={t.close}><X size={16} /></button>
      </header>
      <div className="lx-sidepanel__body" aria-live="polite">
        <p className="lx-help" style={{ fontSize: 12.5 }}>{t.about}</p>
        <div className="lx-legend" aria-hidden>
          <span><i style={{ background: "var(--primary)" }} />{t.legend.lesson}</span>
          <span><i style={{ background: "var(--ws-success)" }} />{t.legend.source}</span>
          <span><i style={{ border: "1px dashed var(--ws-line-strong)" }} />{t.legend.general}</span>
        </div>
        {!caps.ai && (
          <div className="lx-notice" data-tone="info">
            <Sparkles size={16} aria-hidden />
            <div style={{ display: "grid", gap: 8 }}>
              <span>{t.off}</span>
              <div className="lx-actions">
                <button type="button" className="ws-btn ws-btn--sm" onClick={() => onHandoff("chatgpt", question)}>{t.chatgpt}</button>
                <button type="button" className="ws-btn ws-btn--sm" onClick={() => onHandoff("claude", question)}>{t.claude}</button>
              </div>
            </div>
          </div>
        )}
        {thread.map((m) => (
          <div key={m.id} className="lx-msg" data-role={m.role}>
            {m.role === "user" ? (
              <>
                {m.selection && <div className="lx-quote">{excerpt(m.selection, 200)}</div>}
                <span>{m.parts.map((p) => p.text).join("\n")}</span>
              </>
            ) : m.parts.map((p, i) => {
              const Icon = groundingIcon[p.grounding];
              const source = p.sourceId ? sources.find((s) => s.id === p.sourceId) : undefined;
              return (
                <div key={i} className="lx-msg__part" data-grounding={p.grounding}>
                  <span className="lx-msg__tag"><Icon size={12} aria-hidden />{t.legend[p.grounding]}{source ? ` · ${source.shortLabel || source.title}${p.locator ? ` · ${p.locator}` : ""}` : ""}</span>
                  <div style={{ whiteSpace: "pre-wrap" }}>{p.text}</div>
                  {p.grounding === "general" && <small className="lx-muted">{t.noteGeneral}</small>}
                  {p.blockId && <button type="button" className="lx-link" onClick={() => jumpTo(p.blockId!)}>{t.jump}</button>}
                </div>
              );
            })}
          </div>
        ))}
        {busy && <p className="lx-muted" role="status">{t.thinking}</p>}
        {error && caps.ai && <p className="lx-error" role="alert">{error}</p>}
        <div ref={end} />
      </div>
      <form className="lx-sidepanel__foot" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        {selection && (
          <div className="lx-panel__row" style={{ alignItems: "flex-start" }}>
            <div className="lx-quote" style={{ flex: 1 }}><strong style={{ fontSize: 11 }}>{t.about2}</strong><br />{excerpt(selection.text, 160)}</div>
            <button type="button" className="ws-icon-button" onClick={onClearSelection} aria-label={t.removeSel}><X size={14} /></button>
          </div>
        )}
        <div className="lx-toolbar">
          <textarea className="lx-textarea" style={{ minHeight: 42 }} rows={2} value={question} placeholder={t.placeholder} aria-label={t.placeholder}
            onChange={(e) => setQuestion(e.target.value)} maxLength={2000}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (caps.ai) void ask(); else onHandoff("chatgpt", question); } }} />
          {caps.ai && <button type="submit" className="ws-btn ws-btn--primary" disabled={busy || !question.trim()} aria-label={t.ask}><Send size={16} aria-hidden /></button>}
        </div>
      </form>
    </section>
  );
}
