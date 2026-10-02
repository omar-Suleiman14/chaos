import { beforeEach, describe, expect, it, vi } from "vitest";
const lookup = vi.hoisted(() => vi.fn());
vi.mock("@/app/card/[username]/lookup", () => ({ publicCard: lookup }));
vi.mock("@/app/card/[username]/PublicCard", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("404"); },
  permanentRedirect: (path: string) => { throw new Error(`308 ${path}`); },
}));
import CardPage, { generateMetadata } from "@/app/card/[username]/page";

describe("public card metadata", () => {
  // Returning the mock makes Vitest treat it as hook cleanup and call it after the test.
  beforeEach(() => { lookup.mockReset(); });
  it("indexes a permitted server result and uses its canonical username", async () => {
    lookup.mockResolvedValue({ name: "Casey", username: "casey-current" });
    const meta = await generateMetadata({ params: Promise.resolve({ username: "CASEY" }) });
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe("/card/casey-current");
  });
  it("passes already decoded params unchanged and gives unavailable cards 404/noindex", async () => {
    lookup.mockResolvedValue(null);
    const params = Promise.resolve({ username: "%" });
    expect((await generateMetadata({ params })).robots).toEqual({ index: false, follow: false });
    expect(lookup).toHaveBeenCalledWith("%");
    await expect(CardPage({ params })).rejects.toThrow("404");
  });
  it("does not index arbitrary names when the backend cannot be reached", async () => {
    lookup.mockRejectedValue(new Error("offline"));
    expect((await generateMetadata({ params: Promise.resolve({ username: "someone" }) })).robots).toEqual({ index: false, follow: false });
  });
  it("redirects old aliases and uppercase routes directly to the current username", async () => {
    lookup.mockResolvedValue({ name: "Casey", username: "casey-current" });
    for (const username of ["casey-old", "CASEY-CURRENT"]) {
      const params = Promise.resolve({ username });
      await expect(CardPage({ params })).rejects.toThrow("308 /card/casey-current");
      expect((await generateMetadata({ params })).alternates?.canonical).toBe("/card/casey-current");
    }
  });
  it("renders the current card without a redirect", async () => {
    lookup.mockResolvedValue({ name: "Casey", username: "casey-current" });
    await expect(CardPage({ params: Promise.resolve({ username: "casey-current" }) })).resolves.toBeTruthy();
  });
});
