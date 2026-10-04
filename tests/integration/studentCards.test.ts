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
it("keeps guests private and allows only the learner to opt in their actual Card", async () => {
  const { t, teacher, student, username } = await setup();
  await t.run(async ctx => {
    await recordStudent(ctx, { authorId: creatorIdentity.subject, studentId: otherCreatorIdentity.subject, context: "Anatomy" });
    await recordStudent(ctx, { authorId: creatorIdentity.subject, guestKey: "anonymous-attempt", guestName: "Guest learner", context: "Quiz" });
    await recordStudent(ctx, { authorId: creatorIdentity.subject, studentId: otherCreatorIdentity.subject, context: "Second lesson" });
  });
  const paginationOpts = { numItems: 24, cursor: null };
  expect(await teacher.query(api.studentRoster.count, {})).toBe(2);
  const privateRows = await teacher.query(api.studentRoster.mine, { paginationOpts });
  expect(privateRows.page.find(row => row.name === "Guest learner")?.username).toBeNull();
  expect((await t.query(api.studentRoster.publicStudents, { username, paginationOpts })).page).toEqual([]);
  await expect(teacher.mutation(api.studentRoster.setPublicVisibility, { username, visible: true })).rejects.toThrow("No student relationship");
  await student.mutation(api.studentRoster.setPublicVisibility, { username, visible: true });
  const visible = (await t.query(api.studentRoster.publicStudents, { username, paginationOpts })).page;
  expect(visible).toHaveLength(1); expect(visible[0].username).toBeTruthy(); expect(visible[0].context).toBeNull();
  await student.mutation(api.studentRoster.setPublicVisibility, { username, visible: false });
  expect((await t.query(api.studentRoster.publicStudents, { username, paginationOpts })).page).toEqual([]);
});
it("pages beyond 100 relationships without duplication and bounds each request", async () => {
  const { t, teacher } = await setup();
  await t.run(async ctx => { for (let i = 0; i < 125; i++) await recordStudent(ctx, { authorId: creatorIdentity.subject, guestKey: `attempt-${i}`, context: "Practice" }); });
  const ids: string[] = []; let cursor: string | null = null, done = false;
  while (!done) { const page: FunctionReturnType<typeof api.studentRoster.mine> = await teacher.query(api.studentRoster.mine, { paginationOpts: { numItems: 100, cursor } }); expect(page.page.length).toBeLessThanOrEqual(48); ids.push(...page.page.map(row => row.id)); cursor = page.continueCursor; done = page.isDone; }
  expect(new Set(ids).size).toBe(125); expect(ids.length).toBe(125);
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
