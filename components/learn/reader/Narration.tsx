"use client";
/**
 * Read aloud: the compact audio controller and the narration session behind it.
 * Loaded on demand (next/dynamic) the first time a reader presses Listen or Read aloud, so
 * lessons that are never listened to carry none of this code.
 *
 * React state here changes per sentence at most (the controller); per-word following goes
 * straight to the DOM overlay (NarrationFollower) and never re-renders the lesson.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AudioLines, Check, ChevronDown, ChevronUp, LocateFixed, Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import { WsMenu } from "@/components/workspace/primitives";
import { useCopy } from "@/lib/i18n";
import { NarrationPlayer, type Snapshot } from "@/lib/learn/narration/player";
import { buildNarration, buildTextNarration, stepForTarget } from "@/lib/learn/narration/sequence";
import { NarrationFollower } from "@/lib/learn/narration/follow";
import { loadVoices, pickVoice, rankVoices, readerRegion } from "@/lib/learn/narration/voices";
import { speechSupported } from "@/lib/learn/narration/support";
import { readSectionSpeeds, speedFor, writeSectionSpeed } from "@/lib/learn/narration/speeds";
import type { Lang } from "@/lib/learn/narration/speakable";
import { SPEEDS, useReaderPrefs } from "@/lib/learn/readerPrefs";
import { useVoices } from "./useVoices";

const copy = {
  en: {
    region: "Read aloud", play: "Play", pause: "Pause", resume: "Resume", replay: "Play again", retry: "Try again", stop: "Stop and close",
    previous: "Previous section", next: "Next section", speed: "Playback speed", sectionSpeed: "Speed for this section", useLessonSpeed: (s: string) => `Use lesson speed (${s})`,
    voice: "Voice", noVoices: "No voices for this language on this device.", automatic: "Automatic", minimize: "Minimize player", expand: "Show player", follow: "Back to the narration",
    section: (i: number, n: number) => `Section ${i} of ${n}`, selection: "Reading your selection", progress: "Narration progress",
    checkpoint: "Checkpoint: finish the activity to continue", skip: "Continue reading", finished: "Finished", paused: "Paused", playing: "Playing", loading: "Starting…",
    unsupported: "Read aloud isn't available in this browser.", failed: "Read aloud stopped. The voice may be unavailable.",
    langs: { en: "English", ar: "Arabic" } as Record<Lang, string>,
  },
  ar: {
    region: "القراءة بصوت عالٍ", play: "تشغيل", pause: "إيقاف مؤقت", resume: "استئناف", replay: "شغّل من جديد", retry: "أعد المحاولة", stop: "إيقاف وإغلاق",
    previous: "القسم السابق", next: "القسم التالي", speed: "سرعة التشغيل", sectionSpeed: "سرعة هذا القسم", useLessonSpeed: (s: string) => `استخدم سرعة الدرس (${s})`,
    voice: "الصوت", noVoices: "لا أصوات لهذه اللغة على هذا الجهاز.", automatic: "تلقائي", minimize: "صغّر المشغّل", expand: "أظهر المشغّل", follow: "عُد إلى موضع القراءة",
    section: (i: number, n: number) => `القسم ${i} من ${n}`, selection: "قراءة النص المحدد", progress: "تقدم القراءة",
    checkpoint: "نقطة تحقق: أكمل النشاط للمتابعة", skip: "تابع القراءة", finished: "انتهت القراءة", paused: "متوقف مؤقتًا", playing: "قيد التشغيل", loading: "جارٍ البدء…",
    unsupported: "القراءة بصوت عالٍ غير متاحة في هذا المتصفح.", failed: "توقفت القراءة. ربما الصوت غير متاح.",
    langs: { en: "الإنجليزية", ar: "العربية" } as Record<Lang, string>,
  },
};

/** `title` names what a selection read is (a glossary term); otherwise the player says "Reading your selection". */
export type NarrationRequest = { id: number; mode: "lesson"; from?: string } | { id: number; mode: "selection"; text: string; title?: string };

export interface NarrationProps {
  request: NarrationRequest;
  lessonId: string;
  content: unknown;
  title: string;
  description?: string;
  language?: string;
  article: RefObject<HTMLElement | null>;
  /** Finished lesson activities, by key: a checkpoint resumes once its activity is here. */
  activities: Record<string, unknown>;
  onClose: () => void;
}

const IDLE: Snapshot = { status: "idle", index: 0, section: 0, wordTiming: null };

export default function Narration({ request, lessonId, content, title, description, language, article, activities, onClose }: NarrationProps) {
  const t = useCopy(copy);
  const [prefs, setPrefs] = useReaderPrefs();
  const voices = useVoices();
  const [overrides, setOverrides] = useState(() => readSectionSpeeds(lessonId));
  const [snap, setSnap] = useState<Snapshot>(IDLE);
  const [minimized, setMinimized] = useState(false);
  const [detached, setDetached] = useState(false);
  const [layer, setLayer] = useState<HTMLSpanElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setHost(article.current), [article]);
  const bar = useRef<HTMLElement>(null);
  const player = useRef<NarrationPlayer | null>(null);
  const follower = useRef<NarrationFollower | null>(null);
  const lesson = request.mode === "lesson";

  // Built once per request from the lesson's blocks (the page DOM is only followed, never read).
  const sequence = useMemo(
    () => (request.mode === "lesson" ? buildNarration(content, { title, description, language }) : buildTextNarration(request.text, language)),
    [request.id], // eslint-disable-line react-hooks/exhaustive-deps -- a narration keeps the lesson it started with
  );
  const latest = useRef({ prefs, voices, overrides, activities });
  useLayoutEffect(() => { latest.current = { prefs, voices, overrides, activities }; });

  useEffect(() => {
    if (!lesson || !layer || !host) return;
    const f = new NarrationFollower(host, layer, { onDetach: setDetached, bottomInset: () => bar.current?.offsetHeight ?? 0 });
    f.setMode(latest.current.prefs.follow);
    f.setColor(latest.current.prefs.narrationColor);
    follower.current = f;
    const step = player.current && sequence.steps[player.current.index];
    if (step?.kind === "speech" && player.current?.status !== "idle") f.showStep(step, null);
    return () => { f.destroy(); follower.current = null; };
  }, [lesson, layer, host, sequence]);

  // Following is visual only: a page that cannot be measured never stops the voice.
  const follow = (fn: (f: NarrationFollower) => void) => {
    try { if (follower.current) fn(follower.current); } catch (err) { console.error("Narration follow failed", err); }
  };

  useEffect(() => {
    if (!speechSupported()) { setSnap({ ...IDLE, status: "error", error: "unsupported" }); return; }
    const synth = window.speechSynthesis;
    const voiceFor = (lang: Lang) => {
      const { voices: known, prefs: p } = latest.current;
      return pickVoice(known.length ? known : synth.getVoices(), lang, p.voices[lang], readerRegion(lang));
    };
    const p = new NarrationPlayer(synth, window.SpeechSynthesisUtterance, sequence, {
      voiceFor,
      rateFor: (section) => speedFor(latest.current.prefs, latest.current.overrides, sequence.sections[section]?.id),
      isDone: (key) => key in latest.current.activities,
      onChange: setSnap,
      onStep: (_, step, wordTiming) => follow((f) => f.showStep(step, wordTiming)),
      onWord: (_, range) => follow((f) => f.showWord(range)),
      onCheckpoint: (_, step) => follow((f) => f.showCheckpoint(step.target)),
    });
    player.current = p;
    let live = true;
    const from = request.mode === "lesson" && request.from ? stepForTarget(sequence, request.from) : 0;
    void loadVoices(synth, 800).then(() => { if (live) p.play(from); });
    const leave = () => p.stop();
    window.addEventListener("pagehide", leave);
    return () => {
      live = false;
      window.removeEventListener("pagehide", leave);
      p.destroy();
      player.current = null;
      follower.current?.clear();
    };
  }, [sequence]); // eslint-disable-line react-hooks/exhaustive-deps -- one player per narration

  useEffect(() => { follower.current?.setMode(prefs.follow); }, [prefs.follow]);
  useEffect(() => { follower.current?.setColor(prefs.narrationColor); }, [prefs.narrationColor]);
  // A new voice or speed is heard from the current word on.
  useEffect(() => { player.current?.refresh(); }, [prefs.voices.en, prefs.voices.ar, prefs.speed, prefs.oneSpeed, overrides]);

  // Finishing the activity at a checkpoint resumes reading after a short, natural pause.
  useEffect(() => {
    if (snap.status !== "checkpoint") return;
    const step = sequence.steps[snap.index];
    if (step?.kind !== "checkpoint" || !step.key || !(step.key in activities)) return;
    const timer = setTimeout(() => player.current?.continue(), 900);
    return () => clearTimeout(timer);
  }, [snap, activities, sequence]);

  const section = sequence.sections[snap.section];
  const override = lesson && !prefs.oneSpeed && section ? overrides[section.id] : undefined;
  const rate = speedFor(prefs, overrides, lesson ? section?.id : undefined);
  // Speeds read the same in both interfaces ("1.5×"), isolated so the sign stays after the number in RTL.
  const format = (n: number) => <bdi dir="ltr">{n}×</bdi>;
  const chooseSpeed = (speed: number) => {
    if (lesson && !prefs.oneSpeed && section) setOverrides(writeSectionSpeed(lessonId, section.id, speed));
    else setPrefs({ speed });
  };
  const langs = useMemo(() => [...new Set(sequence.steps.flatMap((s) => (s.kind === "speech" ? [s.lang] : [])))].sort(), [sequence]);

  const { status } = snap;
  const playing = status === "playing";
  const label = status === "error" ? (snap.error === "unsupported" ? t.unsupported : t.failed)
    : status === "checkpoint" ? t.checkpoint
    : status === "ended" ? t.finished
    : request.mode === "selection" ? request.title || t.selection
    : section?.title || title;
  const announce = { idle: t.loading, playing: t.playing, paused: t.paused, checkpoint: t.checkpoint, ended: t.finished, error: label }[status];
  const mainLabel = playing ? t.pause : status === "checkpoint" ? t.skip : status === "ended" ? t.replay : status === "error" ? t.retry : status === "paused" ? t.resume : t.play;
  const progress = sequence.steps.length ? Math.min(1, (snap.index + (status === "ended" ? 1 : 0)) / sequence.steps.length) : 0;
  const unsupported = snap.error === "unsupported";

  const main = (
    <button type="button" className="lx-narration__play" aria-label={mainLabel} title={mainLabel} disabled={unsupported || status === "idle"}
      onClick={() => player.current?.toggle()}>
      {playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
    </button>
  );

  return (
    <>
      {lesson && host && createPortal(<span ref={setLayer} className="lx-narr-layer" aria-hidden />, host)}
      <section ref={bar} className="lx-narration ws-glass" role="region" aria-label={t.region} tabIndex={-1} data-status={status} data-minimized={minimized || undefined}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("[role='menu']")) return;
          const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            if ((e.key === "ArrowRight") !== rtl) player.current?.nextSentence(); else player.current?.previousSentence();
          } else if (e.key === "Escape") { e.preventDefault(); setMinimized(true); }
          else if (e.key === "k" || (e.key === " " && e.target === e.currentTarget)) { e.preventDefault(); player.current?.toggle(); }
        }}>
        <span className="sr-only" aria-live="polite">{announce}</span>
        {minimized ? (
          <div className="lx-narration__mini">
            {main}
            <span className="lx-narration__label" dir="auto">{label}</span>
            <button type="button" className="ws-icon-button lx-narration__btn" aria-label={t.expand} title={t.expand} onClick={() => setMinimized(false)}><ChevronUp size={17} aria-hidden /></button>
          </div>
        ) : (
          <>
            <div className="lx-narration__info">
              <span className="lx-narration__label" dir="auto">{label}</span>
              {lesson && sequence.sections.length > 1 && status !== "error" && <span className="lx-narration__count">{t.section(snap.section + 1, sequence.sections.length)}</span>}
              <span className="lx-narration__meter" role="progressbar" aria-label={t.progress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                <span style={{ transform: `scaleX(${progress})` }} />
              </span>
            </div>
            <div className="lx-narration__controls">
              <WsMenu label={t.speed} align="start" triggerClassName="ws-icon-button lx-narration__btn lx-narration__speed" trigger={<span>{format(rate)}</span>}>
                {(close) => (
                  <>
                    {lesson && !prefs.oneSpeed && <p className="lx-narration__menu-title">{t.sectionSpeed}</p>}
                    {SPEEDS.map((s) => (
                      <button key={s} type="button" role="menuitemradio" aria-checked={rate === s} onClick={() => { chooseSpeed(s); close(); }}>
                        <span style={{ flex: 1 }}>{format(s)}</span>{rate === s && <Check size={15} aria-hidden />}
                      </button>
                    ))}
                    {override !== undefined && section && (
                      <>
                        <hr />
                        <button type="button" role="menuitem" onClick={() => { setOverrides(writeSectionSpeed(lessonId, section.id, null)); close(); }}>{t.useLessonSpeed(`${prefs.speed}×`)}</button>
                      </>
                    )}
                  </>
                )}
              </WsMenu>
              {lesson && <button type="button" className="ws-icon-button lx-narration__btn" aria-label={t.previous} title={t.previous} disabled={unsupported} onClick={() => player.current?.previousSection()}><SkipBack size={17} className="lx-flip" aria-hidden /></button>}
              {main}
              {lesson && <button type="button" className="ws-icon-button lx-narration__btn" aria-label={t.next} title={t.next} disabled={unsupported || snap.section >= sequence.sections.length - 1} onClick={() => player.current?.nextSection()}><SkipForward size={17} className="lx-flip" aria-hidden /></button>}
              <WsMenu label={t.voice} triggerClassName="ws-icon-button lx-narration__btn lx-narration__voice" trigger={<AudioLines size={17} aria-hidden />} menuClassName="lx-narration__voices">
                {(close) => (
                  <>
                    {langs.map((lang) => {
                      const ranked = rankVoices(voices, lang, readerRegion(lang));
                      const chosen = pickVoice(voices, lang, prefs.voices[lang], readerRegion(lang));
                      return (
                        <div key={lang} role="group" aria-label={t.langs[lang]}>
                          {langs.length > 1 && <p className="lx-narration__menu-title">{t.langs[lang]}</p>}
                          {!ranked.length && <p className="lx-muted" style={{ padding: "4px 10px" }}>{t.noVoices}</p>}
                          {ranked.map((v) => (
                            <button key={v.voiceURI} type="button" role="menuitemradio" aria-checked={chosen?.voiceURI === v.voiceURI}
                              onClick={() => { setPrefs({ voices: { ...prefs.voices, [lang]: v.voiceURI } }); close(); }}>
                              <span style={{ flex: 1, minWidth: 0 }} dir="auto">{v.name}</span><span className="lx-muted">{v.lang}</span>{chosen?.voiceURI === v.voiceURI && <Check size={15} aria-hidden />}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </>
                )}
              </WsMenu>
              {detached && lesson && playing && <button type="button" className="ws-icon-button lx-narration__btn" aria-label={t.follow} title={t.follow} onClick={() => follower.current?.reattach()}><LocateFixed size={17} aria-hidden /></button>}
              <span className="lx-narration__spacer" />
              <button type="button" className="ws-icon-button lx-narration__btn" aria-label={t.minimize} title={t.minimize} onClick={() => setMinimized(true)}><ChevronDown size={17} aria-hidden /></button>
              <button type="button" className="ws-icon-button lx-narration__btn" aria-label={t.stop} title={t.stop} onClick={onClose}><Square size={15} aria-hidden /></button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
