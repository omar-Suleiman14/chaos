// Chaos synthesizes its interface sounds with Web Audio instead of shipping
// recorded assets: playback is instant and offline, and one small engine can
// voice several "packs" that match form themes. Every sound runs through a
// compressor and a short synthetic room so tones blend instead of clicking.

export type SfxName = "tap" | "select" | "deselect" | "next" | "back" | "start" | "correct" | "wrong" | "finish" | "error" | "toggle" | "pop" | "lesson_complete" | "course_complete";
export type SfxPack = "soft" | "pop" | "wood" | "arcade" | "off";

interface Engine { ac: AudioContext; out: AudioNode; wet: GainNode; master: GainNode }

let engine: Engine | null = null;
const lastPlayed = new Map<string, number>();
let defaultPack: SfxPack = "soft";
let enabledInMemory: boolean | undefined;

function getEngine(): Engine | null {
  if (typeof window === "undefined") return null;
  if (engine) return engine;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ac = new Ctx();
  try {
    const compressor = ac.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    const master = ac.createGain();
    master.gain.value = 0.55;
    compressor.connect(master).connect(ac.destination);

    // A tiny generated impulse response gives sounds air without a download.
    const convolver = ac.createConvolver();
    const length = Math.floor(ac.sampleRate * 0.9);
    const impulse = ac.createBuffer(2, length, ac.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3.2;
    }
    convolver.buffer = impulse;
    const wet = ac.createGain();
    wet.gain.value = 0.18;
    wet.connect(convolver).connect(compressor);

    engine = { ac, out: compressor, wet, master };
    return engine;
  } catch (error) {
    // A half-created context must not accumulate when an audio device fails.
    void ac.close().catch(() => {});
    throw error;
  }
}

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (enabledInMemory !== undefined) return enabledInMemory;
  try {
    enabledInMemory = window.localStorage.getItem("chaos-sfx") !== "0";
  } catch {
    enabledInMemory = true;
  }
  return enabledInMemory;
}

function setEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  enabledInMemory = enabled;
  // Silence already-scheduled notes and reverb immediately, too.
  if (engine) engine.master.gain.value = enabled ? 0.55 : 0;
  try { window.localStorage.setItem("chaos-sfx", enabled ? "1" : "0"); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent("chaos-sfx-change", { detail: enabled }));
}

// ── Voices ────────────────────────────────────────────────────────────────
interface Voice { at: number; freq: number; dur: number; gain: number; wet?: number }

function envelope(ac: AudioContext, start: number, dur: number, peak: number, attack = 0.004) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  return g;
}

function route(e: Engine, node: AudioNode, wet = 0.5) {
  node.connect(e.out);
  if (wet > 0) {
    const send = e.ac.createGain();
    send.gain.value = wet;
    node.connect(send).connect(e.wet);
  }
}

/** Glassy bell: sine with inharmonic partials and a long tail. */
function bell(e: Engine, v: Voice) {
  const { ac } = e;
  const start = ac.currentTime + v.at;
  const g = envelope(ac, start, v.dur, v.gain, 0.003);
  for (const [ratio, level] of [[1, 1], [2.76, 0.28], [5.4, 0.1]] as const) {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(v.freq * ratio, start);
    const partial = ac.createGain();
    partial.gain.value = level;
    osc.connect(partial).connect(g);
    osc.start(start);
    osc.stop(start + v.dur + 0.05);
  }
  route(e, g, v.wet ?? 0.9);
}

/** Bubble: sine with a quick upward pitch glide. */
function bubble(e: Engine, v: Voice) {
  const { ac } = e;
  const start = ac.currentTime + v.at;
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(v.freq * 0.6, start);
  osc.frequency.exponentialRampToValueAtTime(v.freq * 1.25, start + v.dur * 0.6);
  const g = envelope(ac, start, v.dur, v.gain, 0.006);
  osc.connect(g);
  route(e, g, v.wet ?? 0.35);
  osc.start(start);
  osc.stop(start + v.dur + 0.05);
}

/** Marimba: sine body, a bright transient overtone and a short thump. */
function marimba(e: Engine, v: Voice) {
  const { ac } = e;
  const start = ac.currentTime + v.at;
  const body = ac.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(v.freq, start);
  const overtone = ac.createOscillator();
  overtone.type = "sine";
  overtone.frequency.setValueAtTime(v.freq * 4, start);
  const g = envelope(ac, start, v.dur, v.gain, 0.002);
  const og = envelope(ac, start, Math.min(0.06, v.dur), v.gain * 0.35, 0.001);
  body.connect(g);
  overtone.connect(og);
  route(e, g, v.wet ?? 0.45);
  route(e, og, 0.1);
  body.start(start);
  overtone.start(start);
  body.stop(start + v.dur + 0.05);
  overtone.stop(start + 0.1);
}

/** Chiptune blip: filtered square wave with a pitch drop. */
function blip(e: Engine, v: Voice) {
  const { ac } = e;
  const start = ac.currentTime + v.at;
  const osc = ac.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(v.freq, start);
  osc.frequency.setValueAtTime(v.freq * 1.5, start + v.dur * 0.35);
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 3200;
  const g = envelope(ac, start, v.dur, v.gain * 0.55, 0.002);
  osc.connect(filter).connect(g);
  route(e, g, v.wet ?? 0.08);
  osc.start(start);
  osc.stop(start + v.dur + 0.05);
}

/** Soft noise swoosh used for page turns. */
function swoosh(e: Engine, at: number, dur: number, gain: number, up = true) {
  const { ac } = e;
  const start = ac.currentTime + at;
  const length = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(up ? 500 : 2600, start);
  filter.frequency.exponentialRampToValueAtTime(up ? 2600 : 500, start + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + dur * 0.4);
  g.gain.linearRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(g);
  route(e, g, 0.3);
  src.start(start);
  src.stop(start + dur + 0.02);
}

// Notes in a pentatonic scale so any sequence sounds consonant.
const N = { C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G3: 196, E3: 164.81, C3: 130.81 };

type Score = (e: Engine) => void;
type PackScores = Record<SfxName, Score>;

function build(voice: (e: Engine, v: Voice) => void, scale: number, gain: number, rhythm = 1): PackScores {
  const n = (f: number) => f * scale;
  const play = (notes: [number, number, number?][], dur: number, level = 1): Score => (e) => {
    for (const [at, f, d] of notes) voice(e, { at: at * rhythm, freq: n(f), dur: (d ?? dur) * rhythm, gain: gain * level });
  };
  return {
    tap: play([[0, N.G5]], 0.09, 0.45),
    select: play([[0, N.E5]], 0.35, 0.8),
    deselect: play([[0, N.C5]], 0.22, 0.5),
    toggle: play([[0, N.D5]], 0.18, 0.6),
    pop: play([[0, N.A5]], 0.14, 0.7),
    next: (e) => { swoosh(e, 0, 0.16, 0.05 * gain * 10); voice(e, { at: 0.04, freq: n(N.A4), dur: 0.3, gain: gain * 0.55 }); },
    back: (e) => { swoosh(e, 0, 0.16, 0.05 * gain * 10, false); voice(e, { at: 0.04, freq: n(N.E4), dur: 0.3, gain: gain * 0.5 }); },
    start: play([[0, N.C5], [0.07, N.E5], [0.14, N.G5], [0.21, N.C6, 0.9]], 0.5, 0.8),
    correct: play([[0, N.E5], [0.09, N.A5, 0.8]], 0.55, 0.9),
    wrong: play([[0, N.E4], [0.11, N.C4, 0.5]], 0.35, 0.8),
    error: play([[0, N.D4], [0.08, N.D4]], 0.16, 0.7),
    lesson_complete: play([[0, N.E5, 0.2], [0.13, N.A5, 0.3]], 0.3, 0.55),
    course_complete: play([[0, N.E5, 0.2], [0.13, N.A5, 0.22], [0.26, N.C6, 0.3]], 0.3, 0.55),
    finish: play([[0, N.C5], [0.08, N.E5], [0.16, N.G5], [0.24, N.C6], [0.36, N.E6, 1.2]], 0.7, 0.85),
  };
}

const packs: Record<Exclude<SfxPack, "off">, PackScores> = {
  soft: build(bell, 1, 0.08, 1.04),
  pop: build(bubble, 1, 0.11, 0.94),
  wood: build(marimba, 0.5, 0.18, 1.02),
  arcade: build(blip, 0.5, 0.095, 0.9),
};

function reducedData(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
}

export const sfx = {
  isEnabled,
  setEnabled,
  /** Invoke from a click before asynchronous work so mobile Safari allows the later chime. */
  unlock: () => { if (!isEnabled()) return; try { const e = getEngine(); if (e?.ac.state === "suspended") void e.ac.resume().catch(() => {}); } catch { /* no audio device */ } },
  /** Pack used when `play` is called without one (the legacy quiz player). */
  setDefaultPack: (pack: SfxPack) => { defaultPack = pack; },
  play: (name: SfxName, pack: SfxPack = defaultPack) => {
    if (pack === "off" || !isEnabled() || reducedData()) return;
    try {
      const e = getEngine();
      if (!e) return;
      const now = performance.now();
      const key = `${pack}:${name}`;
      if (now - (lastPlayed.get(key) ?? -Infinity) < 40) return;
      lastPlayed.set(key, now);
      if (e.ac.state === "suspended") void e.ac.resume().catch(() => {});
      packs[pack][name](e);
    } catch {
      // Audio failures must never break the interface.
    }
  },
};
