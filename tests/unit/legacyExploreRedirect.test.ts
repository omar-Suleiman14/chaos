import { expect, it, vi } from "vitest";
import LegacyExplorePage from "@/app/dashboard/learn/explore/page";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

it("preserves legacy filters and repeated query values at the public destination", async () => {
  await LegacyExplorePage({ searchParams: Promise.resolve({ q: "cells & tissues", language: "ar", tag: ["a", "b"], ignored: undefined }) });
  expect(redirect).toHaveBeenCalledWith("/learn?q=cells+%26+tissues&language=ar&tag=a&tag=b");
});
