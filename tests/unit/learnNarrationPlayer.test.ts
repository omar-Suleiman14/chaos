import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NarrationPlayer, type PlayerHooks, type Snapshot } from "@/lib/learn/narration/player";
import { buildNarration, type SpeechStep } from "@/lib/learn/narration/sequence";
import { pickVoice, rankVoices, type VoiceLike } from "@/lib/learn/narration/voices";
import { speedFor } from "@/lib/learn/narration/speeds";

/** A speech engine that speaks only when the test says so, reporting word boundaries like Safari/Chrome local voices. */
class FakeUtterance {
  text: string; lang = ""; rate = 1; voice: unknown = null;
  onboundary: ((e: { name: string; charIndex: number; charLength?: number }) => void) | null = null;
  onend: ((e?: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(text = "") { this.text = text; }
}
class FakeSynth {
  queue: FakeUtterance[] = [];
  spoken: FakeUtterance[] = [];
  paused = false;
  cancels = 0;
  get speaking() { return this.queue.length > 0; }
  get pending() { return this.queue.length > 1; }
  speak(u: FakeUtterance) { this.queue.push(u); this.spoken.push(u); }
  cancel() { this.cancels++; const q = this.queue; this.queue = []; q.forEach((u) => u.onerror?.({ error: "interrupted" })); }
  resume() { this.paused = false; }
  get current() { return this.queue[0]; }
  /** Speak the current utterance word by word, then end it. */
  finish(words = true) {
    const u = this.queue.shift()!;
    if (words) for (const m of u.text.matchAll(/\S+/g)) u.onboundary?.({ name: "word", charIndex: m.index!, charLength: m[0].length });
    u.onend?.();
  }
  word(n: number) {
    const u = this.queue[0];
    const m = [...u.text.matchAll(/\S+/g)][n];
    u.onboundary?.({ name: "word", charIndex: m.index!, charLength: m[0].length });
  }
}

const t = (text: string) => ({ type: "text", text, styles: {} });
const block = (id: string, type: string, content: unknown = [], props: Record<string, unknown> = {}) => ({ id, type, props, content, children: [] });
const content = [
  block("h1", "heading", [t("First")], { level: 1 }),
  block("p1", "paragraph", [t("Alpha beta gamma. Delta epsilon.")]),
  block("q", "quiz", undefined, { assetKind: "quiz", assetId: "q1" }),
  block("h2", "heading", [t("Second")], { level: 1 }),
  block("p2", "paragraph", [t("الأم الحنون and dura.")]),
];

let synth: FakeSynth;
let states: Snapshot[];
let words: [number, number][];
let steps: string[];
let checkpoints: string[];
let done: Set<string>;
const make = (hooks: Partial<PlayerHooks> = {}, lesson: unknown[] = content) => {
  const narration = buildNarration(lesson, { language: "en" });
  const player = new NarrationPlayer(synth as unknown as SpeechSynthesis, FakeUtterance as unknown as typeof SpeechSynthesisUtterance, narration, {
    voiceFor: (lang) => ({ lang: lang === "ar" ? "ar-SA" : "en-GB", name: lang, voiceURI: lang } as SpeechSynthesisVoice),
    rateFor: () => 1,
    isDone: (key) => done.has(key),
    onChange: (s) => states.push(s),
    onStep: (_, step) => steps.push(step.text),
    onWord: (_, range) => { if (range) words.push(range); },
    onCheckpoint: (_, step) => checkpoints.push(step.target),
    ...hooks,
  });
  return { player, narration };
};

beforeEach(() => { synth = new FakeSynth(); states = []; words = []; steps = []; checkpoints = []; done = new Set(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());
const last = () => states.at(-1)!;

describe("whole-lesson narration", () => {
  it("speaks one utterance per sentence and language with that language's voice", () => {
    const { player } = make();
    player.play(stepOf(make().narration, "h2"));
    expect(synth.current.text).toBe("Second");
    synth.finish();
    expect([synth.current.text, synth.current.lang]).toEqual(["الأم الحنون ", "ar-SA"]);
    synth.finish();
    expect([synth.current.text, synth.current.lang]).toEqual(["and dura.", "en-GB"]);
    synth.finish();
    expect(last().status).toBe("ended");
  });

  it("maps word boundaries to the displayed words of the block", () => {
    const { player } = make();
    player.play(stepOf(make().narration, "p1"));
    synth.word(0); synth.word(2);
    const display = "Alpha beta gamma. Delta epsilon.";
    expect(words.map((r) => display.slice(...r))).toEqual(["Alpha", "gamma."]);
    synth.finish(false);
    synth.word(0); synth.word(1);
    expect(words.slice(-2).map((r) => display.slice(...r))).toEqual(["Delta", "epsilon."]);
  });

  it("finishes the sentence before a checkpoint, then waits without speaking over the quiz", () => {
    const { player, narration } = make();
    player.play(stepOf(narration, "p1"));
    synth.finish(); // "Alpha beta gamma."
    synth.finish(); // "Delta epsilon."
    expect(last().status).toBe("checkpoint");
    expect(checkpoints).toEqual(["q"]);
    expect(synth.queue).toHaveLength(0);
    vi.advanceTimersByTime(60_000); // the watchdog never talks over an activity
    expect(synth.queue).toHaveLength(0);
    player.continue();
    expect(synth.current.text).toBe("Second");
  });

  it("does not stop at an activity the reader already finished", () => {
    done.add("quiz:q1");
    const { player, narration } = make();
    player.play(stepOf(narration, "p1"));
    synth.finish(); synth.finish();
    expect(checkpoints).toEqual([]);
    expect(synth.current.text).toBe("Second");
  });

  it("pauses by cancelling and resumes from the last spoken word", () => {
    const { player, narration } = make();
    player.play(stepOf(narration, "p1"));
    synth.word(0); synth.word(1);
    player.pause();
    expect(last().status).toBe("paused");
    expect(synth.queue).toHaveLength(0);
    const before = steps.length;
    player.resume();
    expect(synth.current.text).toBe("beta gamma.");
    expect(steps.length).toBe(before + 1);
    synth.word(1); // "gamma." in the resumed utterance still maps to the original block offsets
    expect("Alpha beta gamma. Delta epsilon.".slice(...words.at(-1)!)).toBe("gamma.");
  });

  it("moves between sections and sentences", () => {
    const { player, narration } = make();
    player.play(0);
    player.nextSection();
    expect(synth.current.text).toBe("Second");
    player.previousSection();
    expect(synth.current.text).toBe("First");
    player.nextSentence();
    expect(synth.current.text).toBe("Alpha beta gamma.");
    player.nextSentence();
    expect(synth.current.text).toBe("Delta epsilon.");
    player.previousSentence();
    expect(synth.current.text).toBe("Alpha beta gamma.");
    expect(narration.sections).toHaveLength(2);
  });

  it("falls back from word to sentence following when the voice reports no word timing", () => {
    const { player, narration } = make();
    player.play(stepOf(narration, "p1"));
    expect(last().wordTiming).toBeNull();
    synth.finish(false);
    expect(last().wordTiming).toBe(false);
    synth.word(0);
    expect(last().wordTiming).toBe(true);
  });

  it("retries without the chosen voice when the engine cannot use it, then reports errors", () => {
    const { player } = make();
    player.play(0);
    synth.queue.shift()!.onerror?.({ error: "voice-unavailable" });
    expect(synth.current.voice).toBeNull();
    synth.queue.shift()!.onerror?.({ error: "network" });
    expect(last()).toMatchObject({ status: "error", error: "network" });
  });

  it("moves on when an engine never reports the end of an utterance", () => {
    const { player } = make();
    player.play(0);
    vi.advanceTimersByTime(30_000);
    expect(synth.spoken.length).toBeGreaterThan(1);
  });

  it("applies the rate for each step's section and restarts the current word when it changes", () => {
    let rate = 1;
    const { player, narration } = make({ rateFor: (section) => (section === 1 ? rate * 2 : rate) });
    player.play(0);
    expect(synth.current.rate).toBe(1);
    player.seek(stepOf(narration, "h2"));
    expect(synth.current.rate).toBe(2);
    rate = 1.5;
    player.refresh();
    expect(synth.current.rate).toBe(3);
  });

  it("stops speaking and ignores late engine events after destroy (navigation or unmount)", () => {
    const { player } = make();
    player.play(0);
    const u = synth.current;
    player.destroy();
    expect(synth.queue).toHaveLength(0);
    const count = states.length;
    u.onend?.();
    u.onboundary?.({ name: "word", charIndex: 0, charLength: 5 });
    vi.advanceTimersByTime(60_000);
    expect(states.length).toBe(count);
    expect(synth.spoken).toHaveLength(1);
  });
});

describe("voices", () => {
  const v = (name: string, lang: string, extra: Partial<VoiceLike> = {}): VoiceLike => ({ name, lang, voiceURI: name, localService: true, default: false, ...extra });
  const voices = [v("Albert", "en-US"), v("Samantha", "en-US"), v("Ava (Premium)", "en-US"), v("Daniel", "en-GB"), v("Maged", "ar-SA"), v("Google العربية", "ar", { localService: false })];

  it("enumerates voices per language, best first, and never picks novelty voices", () => {
    expect(rankVoices(voices, "en").map((x) => x.name)).toEqual(["Ava (Premium)", "Samantha", "Daniel", "Albert"]);
    expect(rankVoices(voices, "en", "GB")[0].name).toBe("Ava (Premium)");
    expect(rankVoices(voices, "ar").map((x) => x.name)).toEqual(["Maged", "Google العربية"]);
  });

  it("keeps a separate saved voice per language and ignores voices the device no longer has", () => {
    expect(pickVoice(voices, "en", "Daniel")?.name).toBe("Daniel");
    expect(pickVoice(voices, "ar", "Google العربية")?.name).toBe("Google العربية");
    expect(pickVoice(voices, "ar", "Daniel")?.name).toBe("Maged");
    expect(pickVoice(voices, "en", "Gone")?.name).toBe("Ava (Premium)");
    expect(pickVoice([], "ar")).toBeNull();
  });

  it("uses Moira (Irish English) as the automatic English voice when the device has it", () => {
    const apple = [...voices, v("Moira", "en-IE"), v("Moira (Enhanced)", "en-IE")];
    expect(pickVoice(apple, "en")?.name).toBe("Moira (Enhanced)");
    expect(pickVoice(apple, "en", "Daniel")?.name).toBe("Daniel");
    expect(pickVoice(voices, "en")?.name).toBe("Ava (Premium)");
    expect(pickVoice(apple, "ar")?.name).toBe("Maged");
  });
});

describe("playback speed", () => {
  it("uses one speed for the whole lesson, or a section's own speed when allowed", () => {
    const overrides = { h2: 1.5 };
    expect(speedFor({ speed: 1.25, oneSpeed: true }, overrides, "h2")).toBe(1.25);
    expect(speedFor({ speed: 1.25, oneSpeed: false }, overrides, "h2")).toBe(1.5);
    expect(speedFor({ speed: 1.25, oneSpeed: false }, overrides, "h1")).toBe(1.25);
  });
});

function stepOf(n: ReturnType<typeof buildNarration>, target: string) {
  return n.steps.findIndex((s) => s.target === target && (s as SpeechStep).kind === "speech");
}
