import { render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import NotificationBell from "@/components/NotificationBell";

const state = vi.hoisted(() => ({
  authenticated: false,
  reads: [] as Array<{ name: string; args: unknown }>,
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: state.authenticated, isLoading: !state.authenticated }),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(ref);
    state.reads.push({ name, args });
    if (name === "notifications:getNotificationPreferences" && args !== "skip" && !state.authenticated)
      throw new Error("Not authenticated");
    return name === "notifications:listNotifications" ? { items: [], unread: 0 } : undefined;
  },
  useMutation: () => vi.fn(),
}));
vi.mock("@/lib/optimistic", () => ({
  markNotificationsReadLocally: vi.fn(),
  useOptimisticMutation: () => vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  useCopy: (messages: { en: unknown }) => messages.en,
  useLocale: () => ({ locale: "en" }),
  formatNumber: (_locale: string, n: number) => String(n),
}));
vi.mock("@/components/PushNotificationControl", () => ({ default: () => null }));

beforeEach(() => {
  state.authenticated = false;
  state.reads = [];
});

it("skips private notification preferences before auth, resumes on sign-in, and skips again on sign-out", () => {
  const view = render(<NotificationBell />);
  const preferenceArgs = () =>
    state.reads.filter((read) => read.name === "notifications:getNotificationPreferences").map((read) => read.args);

  expect(preferenceArgs()).toEqual(["skip"]);
  expect(state.reads.find((read) => read.name === "notifications:listNotifications")?.args).toEqual(undefined);

  state.authenticated = true;
  view.rerender(<NotificationBell />);
  expect(preferenceArgs().at(-1)).toEqual({});

  state.authenticated = false;
  view.rerender(<NotificationBell />);
  expect(preferenceArgs().at(-1)).toBe("skip");
});
