import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { creatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("converts classic quizzes to quiz forms, re-points everything that used them, then purges them", async () => {
  vi.useFakeTimers();
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  const t = createTestConvex(), owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const now = Date.now();
  // A published classic quiz with each question type, an attempt, and an archived draft quiz.
  const { quizId, draftQuizId } = await t.run(async (ctx) => {
    const base = { creatorId: creatorIdentity.subject, creatorUsername: "creator", createdAt: now, updatedAt: now };
    const quizId = await ctx.db.insert("quizzes", { ...base, title: "Liver check", slug: "liver-check", isPublished: true });
    const draftQuizId = await ctx.db.insert("quizzes", { ...base, title: "Old draft", slug: "old-draft", isPublished: false, archived: true });
    const qs: Id<"questions">[] = [];
    qs.push(await ctx.db.insert("questions", { quizId, type: "mcq", questionText: "Largest organ?", options: ["Liver", "Spleen"], correctAnswer: "Liver", points: 2, order: 0, explanation: "By weight, internally." }));
    qs.push(await ctx.db.insert("questions", { quizId, type: "true_false", questionText: "Bile is made in the liver.", correctAnswer: "true", points: 1, order: 1 }));
    qs.push(await ctx.db.insert("questions", { quizId, type: "multi_select", questionText: "Portal tributaries", options: ["Splenic", "Renal", "SMV"], correctAnswers: ["Splenic", "SMV"], points: 3, order: 2 }));
    qs.push(await ctx.db.insert("questions", { quizId, type: "written", questionText: "Explain portal hypertension.", points: 4, order: 3, keywords: ["pressure"] }));
    await ctx.db.insert("questions", { quizId: draftQuizId, type: "mcq", questionText: "Unfinished?", options: ["A"], points: 1, order: 0 });
    await ctx.db.insert("quizSessions", { quizId, playerName: "Sam", score: 2, totalPoints: 10, answers: [{ questionId: qs[0], answer: "Liver", isCorrect: true, pointsEarned: 2 }], startedAt: now, status: "completed", completedAt: now });
    return { quizId, draftQuizId };
  });
  // Everything that can point at a classic quiz: a lesson block and attachment, a course module, a folder, a past game.
  const courseId = await owner.mutation(api.courses.create, { title: "Liver" });
  const lessonId = await owner.mutation(api.courses.addLesson, { courseId });
  const { folderId, gameId } = await t.run(async (ctx) => {
    const lesson = (await ctx.db.get("lessons", lessonId))!;
    const quizBlock = { id: "q1", type: "quiz" as const, citations: [], conceptIds: [], asset: { kind: "quiz" as const, id: quizId } };
    await ctx.db.patch("lessons", lessonId, { draft: { ...lesson.draft, blocks: [...lesson.draft.blocks, quizBlock, { ...quizBlock, id: "q2", asset: { kind: "quiz" as const, id: draftQuizId } }] } });
    await ctx.db.insert("lessonAssessments", { lessonId, asset: { kind: "quiz", id: quizId }, label: "Check", order: 0 });
    await ctx.db.patch("learnCollections", courseId, { modules: [{ id: "m1", title: "Basics", lessonIds: [lessonId], assessments: [{ kind: "quiz", id: quizId }] }] });
    const folderId = await ctx.db.insert("folders", { ownerId: creatorIdentity.subject, name: "Quizzes", parentId: null, createdAt: now, updatedAt: now });
    await ctx.db.insert("folderMembers", { ownerId: creatorIdentity.subject, folderId, asset: { kind: "quiz", id: quizId }, createdAt: now });
    const gameId = await ctx.db.insert("liveGames", { hostId: creatorIdentity.subject, quizId, title: "Liver check", pin: "123456", state: "ended", questionIndex: 0, questions: [], skippedQuestions: 0, settings: { timeLimitSec: 20, maxPlayers: 100, language: "en" }, lastActivityAt: now, createdAt: now } as never);
    return { folderId, gameId };
  });

  await t.mutation(internal.classicQuizMigration.start, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const result = await t.run(async (ctx) => {
    const conversions = await ctx.db.query("classicQuizConversions").collect();
    const formOf = (id: string) => conversions.find((c) => c.quizId === id)!.formId;
    return {
      live: await ctx.db.get("forms", formOf(quizId)), archived: await ctx.db.get("forms", formOf(draftQuizId)),
      formId: formOf(quizId), lesson: await ctx.db.get("lessons", lessonId), attachments: await ctx.db.query("lessonAssessments").collect(),
      course: await ctx.db.get("learnCollections", courseId), folder: await ctx.db.query("folderMembers").withIndex("by_ownerId_and_folderId_and_asset", (q) => q.eq("ownerId", creatorIdentity.subject).eq("folderId", folderId)).collect(),
      game: await ctx.db.get("liveGames", gameId),
      left: { quizzes: (await ctx.db.query("quizzes").collect()).length, questions: (await ctx.db.query("questions").collect()).length, sessions: (await ctx.db.query("quizSessions").collect()).length },
    };
  });
  // The live quiz is a published quiz form with the same questions, keys, marks and explanation.
  expect(result.live).toMatchObject({ ownerId: creatorIdentity.subject, title: "Liver check", status: "live", publishedVersion: 1, source: { kind: "import", label: "Classic quiz" } });
  const fields = result.live!.draft.fields;
  expect(fields.map((f) => [f.type, f.label, f.quiz?.points ?? null])).toEqual([
    ["choice", "Largest organ?", 2], ["choice", "Bile is made in the liver.", 1], ["multi_choice", "Portal tributaries", 3], ["textarea", "Explain portal hypertension.", null],
  ]);
  const key = (i: number) => fields[i].quiz!.correctOptionIds.map((id) => fields[i].options!.find((o) => o.id === id)!.label);
  expect([key(0), key(1), key(2)]).toEqual([["Liver"], ["True"], ["Splenic", "SMV"]]);
  expect(fields[0].quiz?.explanation).toBe("By weight, internally.");
  // The unfinished draft becomes an archived draft form; it is not published.
  expect(result.archived).toMatchObject({ status: "archived", title: "Old draft" });
  expect(result.archived!.publishedVersion).toBeUndefined();
  // References now point at the forms.
  expect(result.lesson!.draft.blocks.filter((b) => b.type === "quiz").map((b) => (b as { asset: unknown }).asset)).toEqual([{ kind: "form", id: result.formId }, { kind: "form", id: result.archived!._id }]);
  expect(result.attachments.map((a) => a.asset)).toEqual([{ kind: "form", id: result.formId }]);
  expect(result.course!.modules![0].assessments).toEqual([{ kind: "form", id: result.formId }]);
  expect(result.folder.map((m) => m.asset)).toEqual([{ kind: "form", id: result.formId }]);
  expect(result.game).toMatchObject({ formId: result.formId });
  expect(result.game!.quizId).toBeUndefined();
  // And the classic data is gone.
  expect(result.left).toEqual({ quizzes: 0, questions: 0, sessions: 0 });
  expect(await t.query(internal.classicQuizMigration.status, {})).toEqual({ quizzesLeft: 0, conversions: 2 });

  // Running it again changes nothing.
  await t.mutation(internal.classicQuizMigration.start, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await t.run((ctx) => ctx.db.query("forms").collect())).length).toBe(2);
});
