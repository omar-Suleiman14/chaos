import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createTestConvex } from "./setup";
import { connectMcp, convexMcpCaller } from "../../perf/lib/mcp";
import { perfCreator as creator, signIn } from "../../perf/lib/fixtures";

/**
 * Regression: "create quiz → publish → attach to lesson" failed for real
 * people. Every step goes through the production MCP path (MCP server →
 * /api/mcp/v1 → Convex), using exactly the ids each tool returned, and the
 * attachment must then be visible to the lesson's readers.
 */
afterEach(() => vi.unstubAllEnvs());
type Structured = Record<string, unknown>;
const structured = (result: Awaited<ReturnType<Awaited<ReturnType<typeof connectMcp>>["callTool"]>>) => {
  if (result.isError) throw new Error(JSON.stringify(result.content));
  return result.structuredContent as Structured;
};

async function quizAndLesson() {
  const t = createTestConvex();
  await signIn(t, creator, "perry");
  const mcp = await connectMcp(convexMcpCaller(t, creator.subject));
  const quiz = structured(await mcp.callTool({ name: "create_form", arguments: {
    title: "Cranial nerves check", quizMode: true,
    questions: [{ type: "single_choice", label: "Which nerve moves the lateral rectus?", options: ["Abducens", "Trochlear"], correctAnswers: ["Abducens"], points: 1 }],
  } }));
  const lesson = structured(await mcp.callTool({ name: "create_lesson", arguments: {
    metadata: { title: "Cranial nerves", description: "The twelve pairs", language: "en", tags: [] },
    document: { schemaVersion: 1, blocks: [{ id: "intro", type: "paragraph", text: "Twelve pairs.", citations: [], conceptIds: [] }] },
  } }));
  return { t, mcp, quiz, lesson };
}

describe("create quiz → publish → attach to lesson", () => {
  it("attaches with the ids the tools returned and readers see the quiz", async () => {
    const { t, mcp, quiz, lesson } = await quizAndLesson();
    expect(quiz.published).toBe(true);
    const lessonId = lesson.lessonId as string;
    const attached = structured(await mcp.callTool({ name: "attach_lesson_quiz", arguments: { lessonId, asset: { kind: "form", id: quiz.id }, label: "Check yourself", order: 0 } }));
    expect(attached.relationshipId).toBeTruthy();

    const listed = structured(await mcp.callTool({ name: "get_lesson_quizzes", arguments: { lessonId } }));
    expect((listed.assessments as unknown[]).length).toBe(1);
    // Readers of the published lesson get the attached, published quiz.
    const forReaders = await t.query(api.learnFrontend.attachedQuizzes, { lessonId: lessonId as Id<"lessons"> });
    expect(forReaders.map((a) => a.title)).toEqual(["Cranial nerves check"]);

    // Attaching again is idempotent: same relationship, updated label.
    const again = structured(await mcp.callTool({ name: "attach_lesson_quiz", arguments: { lessonId, asset: { kind: "form", id: quiz.id }, label: "Quick check", order: 1 } }));
    expect(again.relationshipId).toBe(attached.relationshipId);
  });

  it("accepts the quiz sent as kind quiz or as a bare id", async () => {
    const { mcp, quiz, lesson } = await quizAndLesson();
    const bare = (quiz.id as string).replace(/^form_/, "");
    for (const asset of [{ kind: "quiz", id: quiz.id }, { kind: "form", id: bare }]) {
      const result = await mcp.callTool({ name: "attach_lesson_quiz", arguments: { lessonId: lesson.lessonId, asset, label: "Check", order: 0 } });
      expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    }
  });

  it("can host the attached quiz live from the lesson", async () => {
    const { mcp, quiz, lesson } = await quizAndLesson();
    structured(await mcp.callTool({ name: "attach_lesson_quiz", arguments: { lessonId: lesson.lessonId, asset: { kind: "form", id: quiz.id }, label: "Check", order: 0 } }));
    const live = structured(await mcp.callTool({ name: "create_lesson_live_game", arguments: { lessonId: lesson.lessonId, asset: { kind: "form", id: quiz.id } } }));
    expect(live.gameId).toBeTruthy();
  });

  it("uses the same quiz id in a lesson quiz block and a course module", async () => {
    const { mcp, quiz, lesson } = await quizAndLesson();
    const block = await mcp.callTool({ name: "add_lesson_blocks", arguments: { lessonId: lesson.lessonId, expectedRevision: 1, blocks: [{ id: "check", type: "quiz", asset: { kind: "form", id: quiz.id }, citations: [], conceptIds: [] }] } });
    expect(block.isError, JSON.stringify(block.content)).toBeFalsy();
    const course = structured(await mcp.callTool({ name: "create_course", arguments: { title: "Neuro" } }));
    const modules = await mcp.callTool({ name: "set_course_modules", arguments: { courseId: course.courseId, modules: [{ id: "anatomy", title: "Anatomy", lessonIds: [], assessments: [{ kind: "form", id: quiz.id }] }] } });
    expect(modules.isError, JSON.stringify(modules.content)).toBeFalsy();
  });

  it("the editor path: a quiz made in the lesson editor attaches as a quiz block readers can open", async () => {
    const t = createTestConvex();
    const owner = await signIn(t, creator, "perry");
    const formId = await owner.mutation(api.forms.createForm, { quizMode: true });
    const draft = (await owner.query(api.forms.getFormForEditor, { formId }))!;
    const saved = await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: draft.draftRevision, definition: { ...draft.draft, title: "Block quiz", fields: [{ id: "q", type: "choice", label: "Pick", required: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], quiz: { correctOptionIds: ["a"], points: 1 } }] } });
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
    const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "With a quiz", description: "", language: "en", tags: [] }, document: { schemaVersion: 1, blocks: [
      { id: "p", type: "paragraph", text: "Read, then answer.", citations: [], conceptIds: [] },
      { id: "quiz", type: "quiz", asset: { kind: "form", id: formId }, citations: [], conceptIds: [] },
    ] } });
    const lesson = await owner.query(api.lessons.getDraft, { lessonId });
    await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: lesson.revision, visibility: "public" });
    const embedded = await t.query(api.learnFrontend.embeddedQuiz, { asset: { kind: "form", id: formId } });
    expect(embedded).not.toBeNull();
  });
});
