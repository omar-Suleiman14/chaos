import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { useHostLive } from "@/components/live/HostLiveButton";
import HostScreen from "@/components/live/HostScreen";
import { toast, toastStore } from "@/lib/toast";

const mocks = vi.hoisted(() => ({ create: vi.fn(), countdown: vi.fn(), push: vi.fn(), now: vi.fn(), view: null as Record<string, unknown> | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/ThemePicker", () => ({ ThemePicker: () => null }));
vi.mock("convex/react", () => ({
  useQuery: () => mocks.view,
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => ({ "live:createGame": mocks.create, "live:setCountdown": mocks.countdown, "live:serverNow": mocks.now })[getFunctionName(ref)] ?? vi.fn(),
}));
vi.mock("@/lib/sfx", () => ({ sfx: { play: vi.fn(), isEnabled: () => false, setEnabled: vi.fn() } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.now.mockImplementation(async () => Date.now());
  mocks.view = { state: "lobby", title: "Quiz", pin: "123456", questionIndex: -1, questionCount: 1, playerCount: 1, players: [{ _id: "player", nickname: "Sam" }], settings: { timeLimitSec: 20, maxPlayers: 50 } };
});

describe("host async controls", () => {
  it("deduplicates creation before React renders busy state", async () => {
    let settle!: (id: string) => void;
    mocks.create.mockImplementation(() => new Promise<string>((resolve) => { settle = resolve; }));
    const { result } = renderHook(() => useHostLive());
    let first!: Promise<boolean>;
    await act(async () => {
      first = result.current.start({ formId: "form" as Id<"forms"> });
      await result.current.start({ formId: "form" as Id<"forms"> });
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await act(async () => { settle("game"); await first; });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/live/game");
    expect(result.current.busy).toBe(false);
  });

  it("unlocks creation after a rejected request", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue("game");
    const { result } = renderHook(() => useHostLive());
    toast.dismiss();
    await act(async () => { expect(await result.current.start({ formId: "form" as Id<"forms"> })).toBe(false); });
    // The failure is reported once, as an error toast.
    expect(toastStore.get().filter(item => !item.leaving)).toMatchObject([{ kind: "error", title: "Offline" }]);
    await act(async () => { await result.current.start({ formId: "form" as Id<"forms"> }); });
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(result.current.busy).toBe(false);
  });

  it("deduplicates pending host actions and unlocks after failure", async () => {
    let reject!: (error: Error) => void;
    mocks.countdown.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; })).mockResolvedValue(undefined);
    render(<HostScreen gameId={"game" as Id<"liveGames">} />);
    const start = screen.getByRole("button", { name: "Start" });
    act(() => { fireEvent.click(start); fireEvent.click(start); });
    expect(mocks.countdown).toHaveBeenCalledTimes(1);
    await act(async () => { reject(new Error("Offline")); });
    expect(screen.getByRole("alert")).toHaveTextContent("Offline");
    expect(start).toBeEnabled();
    await act(async () => { fireEvent.click(start); });
    expect(mocks.countdown).toHaveBeenCalledTimes(2);
  });

  it("does not render host controls when the host query denies access", () => {
    mocks.view = null;
    render(<HostScreen gameId={"game" as Id<"liveGames">} />);
    expect(screen.getByText("This game was not found, or you are not its host.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });
});
