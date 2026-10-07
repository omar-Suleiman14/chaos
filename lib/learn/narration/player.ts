/**
 * Plays a narration through the system speech engine (Web Speech `speechSynthesis`).
 *
 * One utterance per sentence-language span keeps highlights precise, lets Arabic and English
 * use their own voices inside one continuous session, and avoids engines that stop long
 * utterances. Pause cancels and later resumes from the last spoken word: the native
 * pause/resume is unreliable on Android and some desktop engines.
 *
 * Callbacks are split by frequency: `onChange` (status, sentence) is for React; `onWord` fires
 * per spoken word and is meant for direct DOM updates.
 */
import { toDisplay, wordEnd, type Lang } from "./speakable";
import { sectionStart, type CheckpointStep, type Narration, type SpeechStep } from "./sequence";

export type Status = "idle" | "playing" | "paused" | "checkpoint" | "ended" | "error";
export interface Snapshot { status: Status; index: number; section: number; wordTiming: boolean | null; error?: string }

export interface PlayerHooks {
  voiceFor: (lang: Lang) => SpeechSynthesisVoice | null;
  rateFor: (section: number) => number;
  /** A checkpoint whose activity is already done is passed without stopping. */
  isDone?: (key: string) => boolean;
  onChange: (snapshot: Snapshot) => void;
  /** A new utterance starts (or the position moved while paused). */
  onStep?: (index: number, step: SpeechStep, wordTiming: boolean | null) => void;
  /** Display range of the word being spoken, when the engine reports word timing. */
  onWord?: (index: number, range: [number, number] | null) => void;
  onCheckpoint?: (index: number, step: CheckpointStep) => void;
}

type Synth = Pick<SpeechSynthesis, "speak" | "cancel" | "resume" | "paused" | "speaking" | "pending">;
type UtteranceCtor = new (text?: string) => SpeechSynthesisUtterance;

const QUIET_ERRORS = new Set(["interrupted", "canceled"]);
const VOICE_ERRORS = new Set(["voice-unavailable", "language-unavailable", "synthesis-failed", "synthesis-unavailable"]);

export class NarrationPlayer {
  status: Status = "idle";
  index = 0;
  private gen = 0;
  /** Spoken character to resume from inside the current step (start of the last word heard). */
  private resumeAt = 0;
  private wordTiming: Partial<Record<Lang, boolean>> = {};
  private error?: string;
  private current: SpeechSynthesisUtterance | null = null;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private withoutVoice = false;
  private destroyed = false;

  constructor(private synth: Synth, private Utterance: UtteranceCtor, readonly narration: Narration, private hooks: PlayerHooks) {}

  snapshot(): Snapshot {
    const step = this.narration.steps[this.index];
    return { status: this.status, index: this.index, section: step?.section ?? 0, wordTiming: step?.kind === "speech" ? this.wordTiming[step.lang] ?? null : null, error: this.error };
  }

  play(from = this.index) {
    this.halt();
    this.index = Math.max(0, Math.min(from, this.narration.steps.length));
    this.resumeAt = 0;
    this.speak();
  }

  pause() {
    if (this.status !== "playing") return;
    this.halt();
    this.set("paused");
  }

  resume() {
    if (this.status === "paused" || this.status === "error") this.speak();
    else if (this.status === "checkpoint") this.continue();
    else if (this.status === "ended" || this.status === "idle") this.play(this.status === "ended" ? 0 : this.index);
  }

  toggle() { if (this.status === "playing") this.pause(); else this.resume(); }

  stop() {
    this.halt();
    this.resumeAt = 0;
    this.set("idle");
  }

  /** Move to a step. Playing (or waiting) narration continues there; paused narration stays paused. */
  seek(index: number) {
    const keepPaused = this.status === "paused" || this.status === "idle";
    this.halt();
    this.index = Math.max(0, Math.min(index, this.narration.steps.length - 1));
    this.resumeAt = 0;
    if (!keepPaused) { this.speak(); return; }
    const step = this.narration.steps[this.index];
    if (step?.kind === "speech") this.hooks.onStep?.(this.index, step, this.wordTiming[step.lang] ?? null);
    this.set(this.status === "idle" ? "paused" : this.status);
  }

  /** Previous section, or the start of this one when already a little way in. */
  previousSection() {
    const start = sectionStart(this.narration, this.index, 0);
    this.seek(this.index - start > 1 || this.resumeAt > 0 ? start : sectionStart(this.narration, this.index, -1));
  }
  nextSection() {
    const next = sectionStart(this.narration, this.index, 1);
    if (next > this.index) this.seek(next);
  }
  previousSentence() {
    const steps = this.narration.steps;
    let i = this.index;
    while (i > 0 && !(steps[i].kind === "speech" && (steps[i] as SpeechStep).sentenceStart)) i--;
    if (i === this.index && this.resumeAt === 0) { i--; while (i > 0 && !(steps[i].kind === "speech" && (steps[i] as SpeechStep).sentenceStart)) i--; }
    this.seek(Math.max(0, i));
  }
  nextSentence() {
    const steps = this.narration.steps;
    let i = this.index + 1;
    while (i < steps.length && steps[i].kind === "speech" && !(steps[i] as SpeechStep).sentenceStart) i++;
    if (i < steps.length) this.seek(i);
  }

  /** Leave a checkpoint (activity finished, or the reader chose to skip it). */
  continue() {
    if (this.status !== "checkpoint") return;
    this.index++;
    this.resumeAt = 0;
    this.speak();
  }

  /** Voice or speed changed: playing narration restarts the current word with it. */
  refresh() { if (this.status === "playing") { this.halt(); this.speak(); } }

  destroy() {
    this.destroyed = true;
    this.halt();
    this.status = "idle";
  }

  private set(status: Status) {
    this.status = status;
    if (status !== "error") this.error = undefined;
    if (!this.destroyed) this.hooks.onChange(this.snapshot());
  }

  private halt() {
    this.gen++;
    clearTimeout(this.watchdog);
    this.current = null;
    if (this.synth.speaking || this.synth.pending) this.synth.cancel();
  }

  private speak() {
    if (this.destroyed) return;
    const steps = this.narration.steps;
    // Passed checkpoints and empty steps are skipped without recursion.
    for (;;) {
      const step = steps[this.index];
      if (!step) { this.resumeAt = 0; this.set("ended"); return; }
      if (step.kind === "checkpoint") {
        if (step.key && this.hooks.isDone?.(step.key)) { this.index++; continue; }
        this.halt();
        this.set("checkpoint");
        this.hooks.onCheckpoint?.(this.index, step);
        return;
      }
      if (!step.text.slice(this.resumeAt).trim()) { this.index++; this.resumeAt = 0; continue; }
      break;
    }
    const index = this.index;
    const step = steps[index] as SpeechStep;
    const gen = ++this.gen;
    const offset = this.resumeAt;
    const text = step.text.slice(offset);
    const voice = this.withoutVoice ? null : this.hooks.voiceFor(step.lang);
    const rate = this.hooks.rateFor(step.section);
    const u = new this.Utterance(text);
    u.lang = voice?.lang ?? (step.lang === "ar" ? "ar-SA" : "en-US");
    if (voice) u.voice = voice;
    u.rate = rate;
    let heardWord = false;
    const live = () => gen === this.gen && !this.destroyed;
    u.onboundary = (e) => {
      if (!live() || (e.name && e.name !== "word")) return;
      heardWord = true;
      const at = offset + e.charIndex;
      const length = e.charLength || wordEnd(step.text, at) - at;
      this.resumeAt = at;
      if (this.wordTiming[step.lang] !== true) { this.wordTiming[step.lang] = true; this.hooks.onChange(this.snapshot()); }
      this.hooks.onWord?.(index, toDisplay(step.map, at, at + Math.max(1, length)));
      this.arm(gen, step.text.length - at, rate);
    };
    u.onend = () => {
      if (!live()) return;
      clearTimeout(this.watchdog);
      // An engine that spoke a whole sentence without word events does not report word timing.
      if (!heardWord && text.trim().length > 12 && this.wordTiming[step.lang] === undefined) this.wordTiming[step.lang] = false;
      this.withoutVoice = false;
      this.index++;
      this.resumeAt = 0;
      this.speak();
    };
    u.onerror = (e) => {
      if (!live() || QUIET_ERRORS.has(e.error)) return;
      clearTimeout(this.watchdog);
      if (VOICE_ERRORS.has(e.error) && voice && !this.withoutVoice) { this.withoutVoice = true; this.speak(); return; }
      this.error = e.error || "synthesis-failed";
      this.current = null;
      this.set("error");
    };
    this.current = u; // engines drop events of utterances nothing references
    if (this.synth.speaking || this.synth.pending) this.synth.cancel();
    if (this.synth.paused) this.synth.resume();
    this.hooks.onStep?.(index, step, this.wordTiming[step.lang] ?? null);
    if (this.status !== "playing") this.set("playing"); else this.hooks.onChange(this.snapshot());
    this.synth.speak(u);
    this.arm(gen, text.length, rate);
  }

  /** Some engines never fire `end` (lost network voice, backgrounded tab): move on after a generous wait. */
  private arm(gen: number, chars: number, rate: number) {
    clearTimeout(this.watchdog);
    const ms = 4000 + (chars / 12) * 1000 / Math.max(0.5, rate) * 2.5;
    this.watchdog = setTimeout(() => {
      if (gen !== this.gen || this.destroyed || this.status !== "playing") return;
      this.current?.onend?.(new Event("end") as SpeechSynthesisEvent);
    }, ms);
  }
}
