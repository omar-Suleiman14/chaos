/**
 * How far the phone is tilted from the way it's being held, as x (right) and y (down) between -1 and 1.
 * One deviceorientation listener is shared by every card and pair of eyes on the page. The resting
 * angle slowly follows the phone, so the card settles flat again however it's held.
 */
type Listener = (x: number, y: number) => void;

const listeners = new Set<Listener>();
let rest: { beta: number; gamma: number } | null = null;
let started = false, asked = false;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

function orient(e: DeviceOrientationEvent) {
  if (e.beta == null || e.gamma == null) return;
  // Swap axes in landscape so "right" is still the right of the screen.
  const angle = screen.orientation?.angle ?? 0;
  const [right, down] = angle === 90 ? [e.beta, -e.gamma] : angle === 270 ? [-e.beta, e.gamma] : [e.gamma, e.beta];
  rest ??= { beta: down, gamma: right };
  rest.beta += (down - rest.beta) * 0.01; rest.gamma += (right - rest.gamma) * 0.01;
  const x = clamp((right - rest.gamma) / 20), y = clamp((down - rest.beta) / 20);
  listeners.forEach((listener) => listener(x, y));
}

function start() {
  if (started) return;
  started = true;
  window.addEventListener("deviceorientation", orient);
}

/** Calls `listener` as the phone tilts. iOS only allows this after asking, which it does on the first tap. */
export function onDeviceTilt(listener: Listener): () => void {
  listeners.add(listener);
  const Orientation = (window as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (Orientation && typeof Orientation.requestPermission === "function") {
    if (!asked) {
      asked = true;
      const ask = () => { Orientation.requestPermission!().then((state) => { if (state === "granted") start(); }).catch(() => {}); };
      window.addEventListener("touchend", ask, { once: true });
    }
  } else if (Orientation) start();
  return () => { listeners.delete(listener); };
}
