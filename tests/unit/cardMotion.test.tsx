import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useRef } from "react";

// Animation frames run when flush() says so, so the easing can be stepped to rest.
let frames: FrameRequestCallback[] = [];
const flush = (n = 200) => { for (let i = 0; i < n && frames.length; i++) { const run = frames; frames = []; run.forEach((cb) => cb(performance.now())); } };
const box = { left: 100, top: 100, right: 300, bottom: 400, width: 200, height: 300, x: 100, y: 100, toJSON: () => ({}) };

async function load() {
  vi.resetModules();
  const { useTilt } = await import("@/components/card/useTilt");
  const { useEyesFollowPointer } = await import("@/components/card/useEyesFollowPointer");
  function Card() {
    const stage = useRef<HTMLDivElement>(null);
    useTilt(stage);
    useEyesFollowPointer(stage);
    return <div ref={stage} data-testid="stage"><svg><g className="mc-eyes" /></svg></div>;
  }
  const view = render(<Card />);
  const stage = view.getByTestId("stage");
  stage.getBoundingClientRect = () => box as DOMRect;
  (stage.querySelector("svg") as SVGSVGElement).getBoundingClientRect = () => box as DOMRect;
  const read = (name: string) => parseFloat(stage.style.getPropertyValue(name));
  return { stage, read, eyes: stage.querySelector<SVGGElement>(".mc-eyes")! };
}
const point = (clientX: number, clientY: number) => window.dispatchEvent(Object.assign(new Event("pointermove"), { clientX, clientY, pointerType: "mouse" }));
const tilt = (beta: number, gamma: number) => window.dispatchEvent(Object.assign(new Event("deviceorientation"), { beta, gamma }));

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("DeviceOrientationEvent", class {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("member card motion", () => {
  it("slides away from a nearby mouse and tips the near edge back, then settles when it's gone", async () => {
    const { read } = await load();
    point(340, 250); // 40px right of the card, level with its middle
    flush();
    expect(read("--tx")).toBeLessThan(-8);
    expect(Math.abs(read("--ty"))).toBeLessThan(0.5);
    expect(read("--ry")).toBeGreaterThan(3);
    point(140, 110); // over the card's top left
    flush();
    expect(read("--tx")).toBeGreaterThan(8);
    expect(read("--ty")).toBeGreaterThan(8);
    point(900, 250); // far away
    flush();
    expect([read("--tx"), read("--ty"), read("--rx"), read("--ry")]).toEqual([0, 0, 0, 0]);
  });

  it("follows the phone's tilt, card and eyes alike, relative to how it's held", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    vi.advanceTimersByTime(5000);
    const { read, eyes } = await load();
    tilt(40, 0); // the resting angle
    tilt(40, 12); // tipped to the right
    flush();
    expect(read("--ry")).toBeGreaterThan(4);
    expect(eyes.style.transform).toMatch(/^translate\(2\.\d+px/);
  });

  it("lets a mouse that just moved win over the phone's tilt", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    vi.advanceTimersByTime(5000);
    const { read } = await load();
    point(900, 250);
    tilt(40, 0); tilt(40, 12);
    flush();
    expect(read("--ry") || 0).toBe(0);
  });
});
