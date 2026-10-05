import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());
const paragraph = (id: string, text: string) => ({ id, type: "paragraph" as const, text, citations: [], conceptIds: [] });

it("creates a course like a form, publishes it publicly with its lessons, and keeps private for Business", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), other = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  // Personal plan: no Business trial.
  await t.run(async (ctx) => { const u = (await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject)).unique())!; await ctx.db.patch("users", u._id, { plan: "free", planExpiresAt: undefined, isElevated: false }); });

  const courseId = await owner.mutation(api.courses.create, { title: "Liver basics" });
  await expect(owner.mutation(api.courses.publish, { courseId, visibility: "public" })).rejects.toThrow("EMPTY");
  const first = await owner.mutation(api.courses.addLesson, { courseId });
  const second = await owner.mutation(api.courses.addLesson, { courseId, title: "Portal hypertension" });
  for (const lessonId of [first, second]) await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: { schemaVersion: 1, blocks: [paragraph("p", "Text")] } });
  await owner.mutation(api.courses.setOutline, { courseId, lessonIds: [second, first] });
  await owner.mutation(api.courses.update, { courseId, icon: "🩺" });

  // Strangers can neither read the draft nor change the outline.
  await expect(other.query(api.courses.get, { courseId })).rejects.toThrow("NOT_FOUND");
  await expect(other.mutation(api.courses.setOutline, { courseId, lessonIds: [] })).rejects.toThrow("NOT_FOUND");
  expect(await t.query(api.courses.getPublic, { courseId })).toBeNull();

  const draft = await owner.query(api.courses.get, { courseId });
  expect(draft.canPrivate).toBe(false);
  expect(draft.icon).toBe("🩺");
  await expect(owner.mutation(api.courses.publish, { courseId, visibility: "private" })).rejects.toThrow("BUSINESS_REQUIRED");
  expect(await owner.mutation(api.courses.publish, { courseId, visibility: "public" })).toEqual({ ok: true });

  const pub = await t.query(api.courses.getPublic, { courseId });
  expect(pub?.lessons.map((l) => l.title)).toEqual(["Portal hypertension", "Lesson 1"]);
  expect(pub?.icon).toBe("🩺");
  expect((await t.query(api.courses.listPublic, {})).map((c) => c.id)).toContain(courseId);
  // Lessons were explicitly published before the course.
  expect((await t.run((ctx) => ctx.db.get("lessons", first)))?.visibility).toBe("public");

  // A Business seat can publish privately; the public page then hides it.
  await t.run(async (ctx) => { const u = (await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject)).unique())!; await ctx.db.patch("users", u._id, { plan: "pro", planExpiresAt: Date.now() + 86_400_000 }); });
  expect(await owner.mutation(api.courses.publish, { courseId, visibility: "private" })).toEqual({ ok: true });
  expect(await t.query(api.courses.getPublic, { courseId })).toBeNull();
  expect(await owner.query(api.courses.getPublic, { courseId })).not.toBeNull();
});

it("gives a course a Notion-style cover and icon, owner only", async () => {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity), other = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await owner.mutation(api.courses.create, { title: "Stars" });

  await owner.mutation(api.courses.update, { courseId, coverUrl: "/covers/webb/carina.jpg", coverY: 30.4, icon: "🔭" });
  expect(await owner.query(api.courses.get, { courseId })).toMatchObject({ coverUrl: "/covers/webb/carina.jpg", coverY: 30, icon: "🔭" });

  await expect(owner.mutation(api.courses.update, { courseId, coverUrl: "/etc/passwd" })).rejects.toThrow("VALIDATION_FAILED");
  await expect(owner.mutation(api.courses.update, { courseId, coverUrl: "javascript:alert(1)" })).rejects.toThrow("VALIDATION_FAILED");
  await expect(owner.mutation(api.courses.update, { courseId, coverY: 140 })).rejects.toThrow("VALIDATION_FAILED");
  await expect(owner.mutation(api.courses.update, { courseId, icon: "<b>x</b>" })).rejects.toThrow("VALIDATION_FAILED");
  await expect(other.mutation(api.courses.update, { courseId, icon: "🙂" })).rejects.toThrow("NOT_FOUND");

  // Removing the cover also clears its position; null clears the icon.
  await owner.mutation(api.courses.update, { courseId, coverUrl: null, icon: null });
  const cleared = await owner.query(api.courses.get, { courseId });
  expect(cleared.coverUrl).toBeUndefined(); expect(cleared.coverY).toBeUndefined(); expect(cleared.icon).toBeUndefined();
});

it("gives every new course a cover and its lessons different ones", async () => {
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const courseId = await owner.mutation(api.courses.create, { title: "Neuroanatomy" });
  for (let i = 0; i < 8; i++) await owner.mutation(api.courses.addLesson, { courseId });
  const course = await owner.query(api.courses.get, { courseId });
  expect(course.coverUrl).toMatch(/^\/covers\//);
  const covers = await t.run(async (ctx) => Promise.all(course.lessons.map(async (l) => (await ctx.db.get("lessons", l.id))!.metadata.coverUrl)));
  expect(covers.every((c) => c?.startsWith("/covers/"))).toBe(true);
  expect(new Set(covers).size).toBe(covers.length);
});
