import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { useCourseEditorQuery } from "@/lib/courses/useCourseEditorQuery";

const m = vi.hoisted(() => ({
  authenticated: false,
  reads: [] as Array<{ name: string; args: unknown }>,
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: !m.authenticated, isAuthenticated: m.authenticated }),
  useQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) => {
    m.reads.push({ name: getFunctionName(query), args });
    if (args !== "skip" && !m.authenticated) throw new Error("Not authenticated");
    return undefined;
  },
}));

afterEach(() => {
  m.authenticated = false;
  m.reads = [];
});

it("skips the private course query during a cold refresh and resumes after auth restores", () => {
  const courseId = "test-course-id" as Id<"learnCollections">;
  const { rerender } = renderHook(() => useCourseEditorQuery(courseId));
  expect(m.reads).toEqual([{ name: "courses:get", args: "skip" }]);

  m.authenticated = true;
  rerender();
  expect(m.reads.at(-1)).toEqual({ name: "courses:get", args: { courseId } });

  m.authenticated = false;
  rerender();
  expect(m.reads.at(-1)).toEqual({ name: "courses:get", args: "skip" });
});
