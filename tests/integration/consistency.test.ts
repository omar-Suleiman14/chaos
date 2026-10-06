import { describe, expect, it, vi } from "vitest";
import { internal } from "@/convex/_generated/api";
import { issueBody } from "@/convex/consistency";
import { createTestConvex } from "./setup";
import { createCnsCourse, createPublishedLesson, PERF_EPOCH, seedLessonRefs, signIn } from "@/perf/lib/fixtures";

/**
 * The nightly consistency cron reports nothing on healthy data and names each broken
 * invariant (with examples) once relationships are damaged behind the app's back.
 */
async function run(t: ReturnType<typeof createTestConvex>) {
  const reportId = await t.mutation(internal.consistency.start, {});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const report = await t.query(internal.consistency.report, { reportId });
  expect(report?.finishedAt).toBeDefined();
  return report!;
}

describe("consistency checks", { timeout: 60_000 }, () => {
  it("finds nothing in a healthy workspace", async () => {
    vi.setSystemTime(PERF_EPOCH);
    const t = createTestConvex();
    const owner = await signIn(t, undefined, "perry");
    await seedLessonRefs(t, owner);
    await createCnsCourse(owner);
    await createPublishedLesson(owner, "Standalone", 5);
    const report = await run(t);
    expect(report.findings).toEqual([]);
    expect(report.scanned).toBeGreaterThanOrEqual(10);
  });

  it("names broken course, lesson, assessment and cleanup invariants", async () => {
    vi.setSystemTime(PERF_EPOCH);
    const t = createTestConvex();
    const owner = await signIn(t, undefined, "perry");
    const { quizFormId } = await seedLessonRefs(t, owner);
    const { courseId, modules } = await createCnsCourse(owner);
    const lessonId = await createPublishedLesson(owner, "Standalone", 5);
    const gone = modules[0].lessonIds[0];
    await t.run(async (ctx) => {
      // A lesson deleted under a published course, an assessment whose quiz is gone,
      // a lesson whose published version vanished, and a rate window the cleanup missed.
      await ctx.db.delete(gone);
      await ctx.db.insert("lessonAssessments", { lessonId, asset: { kind: "form", id: quizFormId }, label: "Check", order: 0 });
      await ctx.db.delete(quizFormId);
      const lesson = await ctx.db.get(lessonId);
      await ctx.db.delete(lesson!.publishedVersionId!);
      await ctx.db.insert("rateWindows", { key: "stale", windowStart: Date.now() - 3 * 86_400_000, count: 1 });
    });
    const report = await run(t);
    const checks = Object.fromEntries(report.findings.map((f) => [f.check, f]));
    expect(checks["course.lessonMissing"]?.samples[0]).toContain(gone);
    expect(checks["publishedCourse.lessonMissing"]?.samples[0]).toBe(`${courseId} → ${gone}`);
    expect(checks["assessment.orphaned"]?.samples[0]).toContain(quizFormId);
    expect(checks["lesson.publishedVersionMissing"]?.samples[0]).toContain(lessonId);
    expect(checks["stale.rateWindows"]?.count).toBe(1);
    expect(issueBody(report)).toContain("`publishedCourse.lessonMissing`");
  });
});
