import { afterEach, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import HeroAvatars from "@/components/site/HeroAvatars";

const tilt = vi.hoisted(() => vi.fn());
vi.mock("@/components/card/useTilt", () => ({ useTilt: tilt }));
vi.mock("@/components/MemberAvatar", () => ({ default: () => <span /> }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); tilt.mockClear(); });

it.each([false, true])("only installs scroll motion when desktop motion is enabled (%s)", enabled => {
  vi.stubGlobal("matchMedia", () => ({ matches: enabled, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const events = vi.spyOn(window, "addEventListener");
  const view = render(<HeroAvatars />);
  expect(view.container.querySelector(".hero-avatars")).toHaveAttribute("data-motion", String(enabled));
  expect(tilt.mock.calls.at(-1)?.[3]).toBe(enabled);
  expect(events.mock.calls.some(([event]) => event === "scroll")).toBe(enabled);
});
