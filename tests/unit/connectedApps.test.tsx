import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import ConnectedApps from "@/components/connections/ConnectedApps";
import { LocaleProvider } from "@/lib/i18n";

const m = vi.hoisted(() => ({
  results: {} as Record<string, unknown>,
  connect: vi.fn(async () => { throw new Error("[CONVEX M(notion:beginConnect)] [Request ID: 1] Server Error\nUncaught Error: NOTION_NOT_CONFIGURED: Notion is not set up\n    at handler (x)"); }),
  other: vi.fn(async () => null),
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => m.results[getFunctionName(ref)],
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "notion:beginConnect" ? m.connect : m.other,
  useAction: () => m.other,
}));

afterEach(() => { m.results = {}; window.history.replaceState(null, "", "/"); });

describe("Notion app card", () => {
  it("stays announced as coming soon when this deployment has no Notion OAuth setup", () => {
    m.results = { "notion:available": false, "notion:connection": null };
    render(<LocaleProvider initial="en"><ConnectedApps /></LocaleProvider>);
    expect(screen.getByLabelText("Notion: Coming soon")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect Notion" })).toBeNull();
  });

  it("offers Connect when configured and shows a readable error instead of the raw server error", async () => {
    m.results = { "notion:available": true, "notion:connection": null };
    render(<LocaleProvider initial="en"><ConnectedApps /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Connect Notion" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Notion is not set up"));
  });

  it("reports the OAuth result in the page language and removes it from the URL", () => {
    window.history.replaceState(null, "", "/ar/dashboard/connections?notion=denied&tab=apps");
    m.results = { "notion:available": true, "notion:connection": null };
    render(<LocaleProvider initial="ar"><ConnectedApps /></LocaleProvider>);
    expect(screen.getByRole("status").textContent).toBe("لم يُمنح الوصول إلى Notion.");
    expect(window.location.search).toBe("?tab=apps");
  });
});
