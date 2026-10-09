import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { recordStudent } from "../../convex/studentRoster";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), teacher = t.withIdentity(creatorIdentity), student = t.withIdentity(otherCreatorIdentity);
  await teacher.mutation(api.quizFunctions.getOrCreateUser, {});
  await student.mutation(api.quizFunctions.getOrCreateUser, {});
  const card = await teacher.query(api.memberCards.mine, {});
  return { t, teacher, student, username: card!.username };
}
it("keeps an existing generated username when saving a Card while rejecting new reserved choices", async () => {
  const { teacher, student } = await setup();
  const before = (await teacher.query(api.memberCards.mine, {}))!;
  expect(before.username).toMatch(/^user\d{5}$/);
  const saved = await teacher.mutation(api.memberCards.customizeCard, { username: before.username, name: "Meya", finishOnboarding: true });
  expect(saved).toMatchObject({ name: "Meya", username: before.username });
  expect((await teacher.query(api.quizFunctions.getCurrentUser, {}))?.usernameChosen).not.toBe(true);
  await expect(student.mutation(api.memberCards.customizeCard, { username: before.username })).rejects.toThrow("INVALID_USERNAME");
  await expect(teacher.mutation(api.memberCards.customizeCard, { username: "admin" })).rejects.toThrow("INVALID_USERNAME");
});
it("keeps account Cards private until the student opts in, keeps guests private and respects opt-outs", async () => {
  const { t, teacher, student, username } = await setup();
  await t.run(async ctx => {
    await recordStudent(ctx, { authorId: creatorIdentity.subject, studentId: otherCreatorIdentity.subject, context: "Anatomy" });
    await recordStudent(ctx, { authorId: creatorIdentity.subject, guestKey: "anonymous-attempt", guestName: "Guest learner", context: "Quiz" });
    await recordStudent(ctx, { authorId: creatorIdentity.subject, studentId: otherCreatorIdentity.subject, context: "Second lesson" });
  });
  const paginationOpts = { numItems: 24, cursor: null };
  expect(await teacher.query(api.studentRoster.count, {})).toBe(2);
  const privateRows = await teacher.query(api.studentRoster.mine, { paginationOpts });
  expect(privateRows.page).toHaveLength(2);
  expect(privateRows.page.find(row => row.name === "Guest learner")?.username).toBeNull();
  // Studying with a teacher does not make the relationship public.
  expect((await t.query(api.studentRoster.publicStudents, { username, paginationOpts })).page).toEqual([]);
  expect(await student.query(api.studentRoster.myVisibility, { username })).toBe(false);
  await expect(teacher.mutation(api.studentRoster.setPublicVisibility, { username, visible: true })).rejects.toThrow("No student relationship");
  await student.mutation(api.studentRoster.setPublicVisibility, { username, visible: true });
  expect(await student.query(api.studentRoster.myVisibility, { username })).toBe(true);
  const visible = (await t.query(api.studentRoster.publicStudents, { username, paginationOpts })).page;
  expect(visible).toHaveLength(1); expect(visible[0].username).toBeTruthy(); expect(visible[0].context).toBeNull();
  await student.mutation(api.studentRoster.setPublicVisibility, { username, visible: false });
  expect((await t.query(api.studentRoster.publicStudents, { username, paginationOpts })).page).toEqual([]);
});
it("keeps relationships recorded under earlier defaults private without an explicit choice", async () => {
  const { t, username } = await setup();
  const paginationOpts = { numItems: 24, cursor: null };
  await t.run(async ctx => { await recordStudent(ctx, { authorId: creatorIdentity.subject, studentId: otherCreatorIdentity.subject, context: "Lesson" }); });
  const listed = async () => (await t.query(api.studentRoster.publicStudents, { username, paginationOpts })).page;
  // Rows written by the former private default and by the later public default carry no consent.
  for (const publicVisible of [false, true]) {
    await t.run(async ctx => { const row = (await ctx.db.query("authorStudents").first())!; await ctx.db.patch(row._id, { publicVisible }); });
    expect(await listed()).toEqual([]);
  }
  // Neither does a global "show" saved by the old card form, which always submitted its default.
  await t.run(async ctx => {
    const user = (await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", otherCreatorIdentity.subject)).first())!;
    await ctx.db.patch(user._id, { hideStudentCards: false });
  });
  expect(await listed()).toEqual([]);
});
it("pages beyond 100 relationships without duplication and bounds each request", async () => {
  const { t, teacher } = await setup();
  await t.run(async ctx => { for (let i = 0; i < 125; i++) await recordStudent(ctx, { authorId: creatorIdentity.subject, guestKey: `attempt-${i}`, context: "Practice" }); });
  const ids: string[] = []; let cursor: string | null = null, done = false;
  while (!done) { const page: FunctionReturnType<typeof api.studentRoster.mine> = await teacher.query(api.studentRoster.mine, { paginationOpts: { numItems: 100, cursor } }); expect(page.page.length).toBeLessThanOrEqual(48); ids.push(...page.page.map(row => row.id)); cursor = page.continueCursor; done = page.isDone; }
  expect(new Set(ids).size).toBe(125); expect(ids.length).toBe(125);
});
it("applies the global choice to every teacher relationship and saves it even when onboarding is skipped", async () => {
  const { t, teacher, student, username } = await setup();
  const paginationOpts = { numItems: 24, cursor: null };
  await t.run(async ctx => { await recordStudent(ctx, { authorId: creatorIdentity.subject, studentId: otherCreatorIdentity.subject, context: "Lesson" }); });
  expect((await t.query(api.studentRoster.publicStudents, { username, paginationOpts })).page).toEqual([]);
  await student.mutation(api.memberCards.customizeCard, { skip: true, showStudentCards: true });
  expect(await student.query(api.quizFunctions.getCurrentUser, {})).toMatchObject({ hideStudentCards: false, studentCardsPublic: true });
  expect((await t.query(api.studentRoster.publicStudents, { username, paginationOpts })).page).toHaveLength(1);
  await student.mutation(api.memberCards.customizeCard, { skip: true, showStudentCards: false });
  expect((await t.query(api.studentRoster.publicStudents, { username, paginationOpts })).page).toEqual([]);
  await student.mutation(api.studentRoster.setPublicVisibility, { username, visible: true });
  expect(await student.query(api.studentRoster.myVisibility, { username })).toBe(false); // Global opt-out wins.
  await student.mutation(api.studentRoster.setGlobalVisibility, { visible: true });
  expect((await t.query(api.studentRoster.publicStudents, { username, paginationOpts })).page).toHaveLength(1);
  await student.mutation(api.studentRoster.setPublicVisibility, { username, visible: false });
  await student.mutation(api.studentRoster.setGlobalVisibility, { visible: false });
  await student.mutation(api.studentRoster.setGlobalVisibility, { visible: true });
  expect((await t.query(api.studentRoster.publicStudents, { username, paginationOpts })).page).toEqual([]); // Individual opt-out is retained.
  await expect(teacher.mutation(api.studentRoster.setPublicVisibility, { username, visible: false })).rejects.toThrow("No student relationship");
});
it("pages through every eligible public student without an eight-card cap", async () => {
  const { t, username } = await setup();
  await t.run(async ctx => {
    for (let i = 0; i < 61; i++) {
      await ctx.db.insert("users", { clerkId: `student-${i}`, name: `Student ${i}`, username: `student-${i}`, email: `${i}@example.com`, createdAt: 0, studentCardsPublic: true });
      await ctx.db.insert("users", { clerkId: `hidden-${i}`, name: `Hidden ${i}`, username: `hidden-${i}`, email: `h${i}@example.com`, createdAt: 0 });
      await recordStudent(ctx, { authorId: creatorIdentity.subject, studentId: `student-${i}`, context: "Private lesson context" });
      await recordStudent(ctx, { authorId: creatorIdentity.subject, studentId: `hidden-${i}`, context: "Private lesson context" });
    }
  });
  const ids = new Set<string>(); let cursor: string | null = null, done = false;
  while (!done) {
    const result: FunctionReturnType<typeof api.studentRoster.publicStudents> = await t.query(api.studentRoster.publicStudents, { username, paginationOpts: { numItems: 24, cursor } });
    for (const row of result.page) { ids.add(row.id); expect(row.context).toBeNull(); }
    cursor = result.continueCursor; done = result.isDone;
  }
  expect(ids.size).toBe(61);
});
it("persists skippable new-account onboarding and chosen identity across provider sync", async () => {
  const { teacher } = await setup();
  expect((await teacher.query(api.quizFunctions.getCurrentUser, {}))?.cardOnboardingPending).toBe(true);
  await teacher.mutation(api.memberCards.customizeCard, { name: "My chosen name", username: "cardlearner", style: 3, avatar: 2, finishOnboarding: true });
  await teacher.mutation(api.quizFunctions.getOrCreateUser, {});
  expect(await teacher.query(api.memberCards.mine, {})).toMatchObject({ name: "My chosen name", username: "cardlearner", style: 3 });
  expect((await teacher.query(api.quizFunctions.getCurrentUser, {}))?.cardOnboardingPending).toBe(false);
  const before = await teacher.query(api.memberCards.mine, {});
  await teacher.mutation(api.memberCards.customizeCard, { skip: true });
  expect(await teacher.query(api.memberCards.mine, {})).toEqual(before);
});
