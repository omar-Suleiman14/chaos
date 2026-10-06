import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const prewarm = vi.hoisted(() => vi.fn());
vi.mock("@/lib/convexClient", () => ({ convex: { prewarmQuery: prewarm } }));
const { hrefIntentHandlers, warmHref } = await import("@/lib/convexCache");

const warmedQueries = () => prewarm.mock.calls.map(([{ query, args }]) => [getFunctionName(query), args]);

describe("hover prefetch", () => {
  it("warms the data each workspace and reader page opens with", () => {
    for (const href of ["/dashboard/forms/f1", "/ar/dashboard/courses/c1?tab=x", "/dashboard/learn/lessons/l1?course=c1", "/learn/courses/c2", "/learn/l2#top", "/dashboard/settings"]) warmHref(href);
    expect(warmedQueries()).toEqual([
      ["forms:getFormForEditor", { formId: "f1" }],
      ["courses:get", { courseId: "c1" }],
      ["learnFrontend:editableLesson", { id: "l1" }],
      ["courses:getPublic", { courseId: "c2" }],
      ["learnFrontend:publicLesson", { id: "l2" }],
    ]);
  });

  it("warms once per page while the pointer moves around", () => {
    prewarm.mockClear();
    const handlers = hrefIntentHandlers("/dashboard/courses/c9");
    handlers.onPointerEnter();
    handlers.onFocus();
    handlers.onTouchStart();
    expect(prewarm).toHaveBeenCalledTimes(1);
  });
});
