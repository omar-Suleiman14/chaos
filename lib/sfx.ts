type SfxName = "tap" | "select" | "correct" | "wrong" | "next" | "start" | "finish";

type Tone = {
  freq: number;
  ms: number;
  gain: number;
  type?: OscillatorType;
};

const patterns: Record<SfxName, Tone[]> = {
  tap: [{ freq: 220, ms: 22, gain: 0.06, type: "square" }],
  select: [{ freq: 320, ms: 28, gain: 0.06, type: "triangle" }],
  next: [{ freq: 420, ms: 35, gain: 0.06, type: "triangle" }],
  start: [
    { freq: 220, ms: 40, gain: 0.05, type: "sine" },
    { freq: 440, ms: 55, gain: 0.07, type: "triangle" },
  ],
  correct: [
    { freq: 523.25, ms: 55, gain: 0.07, type: "triangle" },
    { freq: 659.25, ms: 70, gain: 0.08, type: "sine" },
  ],
  wrong: [
    { freq: 196, ms: 70, gain: 0.08, type: "square" },
    { freq: 146.8, ms: 90, gain: 0.08, type: "square" },
  ],
  finish: [
    { freq: 392, ms: 45, gain: 0.06, type: "triangle" },
    { freq: 523.25, ms: 55, gain: 0.07, type: "triangle" },
    { freq: 659.25, ms: 70, gain: 0.08, type: "sine" },
  ],
};

let ctx: AudioContext | null = null;
let lastPlayedAt = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  ctx = Ctx ? new Ctx() : null;
  return ctx;
}

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem("chaos-sfx");
  if (stored === "0") return false;
  return true;
}

function setEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("chaos-sfx", enabled ? "1" : "0");
}

function playTonePattern(tones: Tone[]) {
  const ac = getAudioContext();
  if (!ac) return;

  // Keep it subtle and avoid fatigue: throttle rapid-fire sound.
  const now = performance.now();
  if (now - lastPlayedAt < 35) return;
  lastPlayedAt = now;

  // Some browsers require resume after a gesture.
  if (ac.state === "suspended") {
    void ac.resume().catch(() => {});
  }

  const t0 = ac.currentTime;
  let cursor = 0;

  for (const t of tones) {
    const start = t0 + cursor;
    const dur = Math.max(0.005, t.ms / 1000);

    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.type = t.type ?? "sine";
    osc.frequency.setValueAtTime(t.freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, t.gain), start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.start(start);
    osc.stop(start + dur + 0.01);

    cursor += dur;
  }
}

export const sfx = {
  isEnabled,
  setEnabled,
  play: (name: SfxName) => {
    if (!isEnabled()) return;
    playTonePattern(patterns[name]);
  },
};

