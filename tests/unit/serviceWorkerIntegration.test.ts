import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

it("keeps push delivery and public offline navigation in the same worker", async () => {
  const listeners = new Map<string, (event: unknown) => void>();
  const fallback = new Response("public offline page");
  const match = vi.fn().mockResolvedValue(fallback);
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const context = {
    self: { addEventListener: (name: string, handler: (event: unknown) => void) => listeners.set(name, handler),
      registration: { showNotification }, location: { origin: "https://chaos.fail" } },
    caches: { match }, fetch: vi.fn().mockRejectedValue(new Error("offline")), Response, URL,
    importScripts: (path: string) => {
      expect(path).toBe("/chaos-offline-sw.js");
      runInNewContext(readFileSync("public/chaos-offline-sw.js", "utf8"), context);
    },
  };
  runInNewContext(readFileSync("public/push-sw.js", "utf8"), context);
  expect(listeners.has("push")).toBe(true);
  expect(listeners.has("notificationclick")).toBe(true);
  const respondWith = vi.fn();
  listeners.get("fetch")!({ request: { mode: "navigate", method: "GET" }, respondWith });
  expect(await respondWith.mock.calls[0][0]).toBe(fallback);
  expect(match).toHaveBeenCalledWith("/offline.html");
  respondWith.mockClear();
  listeners.get("fetch")!({ request: { mode: "cors", method: "GET" }, respondWith });
  expect(respondWith).not.toHaveBeenCalled();
  const waitUntil = vi.fn();
  listeners.get("push")!({ data: { json: () => ({ lang: "ar", body: "private course content" }) }, waitUntil });
  await waitUntil.mock.calls[0][0];
  expect(showNotification).toHaveBeenCalledWith("Chaos", expect.objectContaining({ data: { path: "/dashboard" } }));
  expect(JSON.stringify(showNotification.mock.calls)).not.toContain("private course content");
});

it("registers the shared push worker when offline support starts", async () => {
  const register = vi.fn().mockResolvedValue({});
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  vi.doMock("../../lib/analytics", () => ({ scheduleAnalytics: vi.fn() }));
  try {
    await import("../../instrumentation-client");
    window.dispatchEvent(new Event("load"));
    expect(register).toHaveBeenCalledWith("/push-sw.js", { scope: "/" });
  } finally { vi.unstubAllGlobals(); vi.doUnmock("../../lib/analytics"); }
});
