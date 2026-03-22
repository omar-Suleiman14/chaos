// Sound effects manager using Howler.js
// All sounds are preloaded on mount for instant playback

let Howl: typeof import("howler").Howl | null = null;

// Lazy load Howler only in browser
async function getHowl() {
  if (typeof window === "undefined") return null;
  if (!Howl) {
    const howler = await import("howler");
    Howl = howler.Howl;
  }
  return Howl;
}

interface SoundMap {
  correct: InstanceType<typeof import("howler").Howl> | null;
  incorrect: InstanceType<typeof import("howler").Howl> | null;
  select: InstanceType<typeof import("howler").Howl> | null;
  tick: InstanceType<typeof import("howler").Howl> | null;
  complete: InstanceType<typeof import("howler").Howl> | null;
  timeout: InstanceType<typeof import("howler").Howl> | null;
}

const sounds: SoundMap = {
  correct: null,
  incorrect: null,
  select: null,
  tick: null,
  complete: null,
  timeout: null,
};

let initialized = false;
let tickLoopId: number | null = null;

export async function initSounds() {
  if (initialized || typeof window === "undefined") return;

  const HowlClass = await getHowl();
  if (!HowlClass) return;

  sounds.correct = new HowlClass({
    src: ["/sounds/correct.mp3"],
    preload: true,
    volume: 0.5,
  });

  sounds.incorrect = new HowlClass({
    src: ["/sounds/incorrect.mp3"],
    preload: true,
    volume: 0.5,
  });

  sounds.select = new HowlClass({
    src: ["/sounds/select.mp3"],
    preload: true,
    volume: 0.3,
  });

  sounds.tick = new HowlClass({
    src: ["/sounds/tick.mp3"],
    preload: true,
    volume: 0.2,
    loop: true,
  });

  sounds.complete = new HowlClass({
    src: ["/sounds/complete.mp3"],
    preload: true,
    volume: 0.6,
  });

  sounds.timeout = new HowlClass({
    src: ["/sounds/timeout.mp3"],
    preload: true,
    volume: 0.5,
  });

  initialized = true;
}

export function playSound(name: keyof SoundMap) {
  if (!sounds[name]) return;
  sounds[name]!.play();
}

export function startTickLoop() {
  if (!sounds.tick) return;
  tickLoopId = sounds.tick.play() as unknown as number;
}

export function stopTickLoop() {
  if (!sounds.tick) return;
  sounds.tick.stop();
  tickLoopId = null;
}

export function stopAllSounds() {
  Object.values(sounds).forEach((s) => {
    if (s) s.stop();
  });
}
