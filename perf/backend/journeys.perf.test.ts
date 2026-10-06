import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { emptyDefinition } from "@/convex/formLogic";
import { createTestConvex } from "@/tests/integration/setup";
import { measureConvex, readMetrics } from "../lib/convex";
import { perfCreator, resumeClock, seedWorkspace, type T } from "../lib/fixtures";
import { connectMcp, convexMcpCaller } from "../lib/mcp";
import { recordPerf } from "../lib/record";

/**
 * The Convex side of each user journey in lib/journeys.ts: every call the
 * page makes from the first request until it marks itself usable. Browser
 * timings for the same journeys live in perf/browser/journeys.spec.ts.
 * Each journey checks the person actually got what they came for before its
 * cost is recorded.
 */
let t: T;
let ws: Awaited<ReturnType<typeof seedWorkspace>>;
beforeAll(async () => {
  t = createTestConvex();
  ws = await seedWorkspace(t);
});
beforeEach(resumeClock);

async function sequence(calls: (() => Promise<unknown>)[]) {
  const out: unknown[] = [];
  for (const call of calls) out.push(await call());
  return out;
}
const journey = (name: string, m: Awaited<ReturnType<typeof measureConvex>>) => ({
  ...readMetrics(`journey.${name}`, m),
  [`journey.${name}.transactions`]: m.cost.transactions,
  ...(m.cost.documentsWritten ? { [`journey.${name}.documentsWritten`]: m.cost.documentsWritten } : {}),
});

describe("journeys", () => {
  it("dashboard → usable", async (ctx) => {
    const m = await measureConvex(() => sequence([
      () => ws.owner.mutation(api.quizFunctions.getOrCreateUser, {}),
      () => ws.owner.query(api.quizFunctions.getIsAdmin, {}),
      () => ws.owner.query(api.quizFunctions.getCurrentUser, {}),
      () => ws.owner.query(api.forms.listMyForms, {}),
      () => ws.owner.query(api.quizFunctions.getMyQuizzes, {}),
      () => ws.owner.query(api.courses.listMine, {}),
      () => ws.owner.query(api.live.myGames, {}),
      () => ws.owner.query(api.forms.listTemplates, {}),
    ]));
    const forms = m.result[3] as { owned: { title: string }[] };
    expect(forms.owned.map((f) => f.title)).toContain("Form 1");
    recordPerf(ctx, journey("dashboard", m));
  });

  it("create form → first question editable", async (ctx) => {
    const definition = { ...emptyDefinition("New form"), fields: [{ id: "first", type: "text" as const, label: "Your name", required: true }] };
    const m = await measureConvex(async () => {
      const formId = await ws.owner.mutation(api.forms.createForm, { definition });
      return await ws.owner.query(api.forms.getFormForEditor, { formId });
    });
    expect(m.result?.draft.fields[0]?.id).toBe("first");
    expect(m.result?.role).toBe("owner");
    recordPerf(ctx, journey("formCreate", m));
  });

  it("existing form → editable", async (ctx) => {
    const formId = ws.forms[3].formId;
    const m = await measureConvex(() => ws.owner.query(api.forms.getFormForEditor, { formId }));
    expect(m.result?.draft.fields.length).toBeGreaterThan(0);
    recordPerf(ctx, journey("formOpen", m));
  });

  it("course → module list usable", async (ctx) => {
    const courseId = ws.course.courseId;
    const m = await measureConvex(() => sequence([
      () => t.query(api.courses.getPublic, { courseId }),
    ]));
    const course = m.result[0] as { modules: { title: string; lessonIds: string[] }[] };
    expect(course.modules.map((x) => x.title)).toEqual(["Anatomy", "Physiology", "Histology"]);
    recordPerf(ctx, journey("courseModules", m));
  });

  it("lesson → readable and interactive", async (ctx) => {
    const lessonId = ws.lessons[0];
    const m = await measureConvex(() => sequence([
      () => t.query(api.learnFrontend.publicLesson, { id: lessonId }),
      () => t.query(api.courses.courseForLesson, { lessonId }),
      () => t.query(api.flashcardStudy.listAttached, { lessonId }),
      () => t.query(api.lessonGlossary.get, { lessonId }),
      // Every quiz block subscribes to its own quiz; the fixture embeds the same quiz four times.
      () => t.query(api.learnFrontend.embeddedQuiz, { asset: { kind: "form", id: ws.quizzes[0].formId } }),
    ]));
    const lesson = m.result[0] as { version: { document: { blocks: unknown[] } } } | null;
    expect(lesson?.version.document.blocks.length).toBeGreaterThan(0);
    expect(m.result[4]).not.toBeNull();
    recordPerf(ctx, journey("lessonRead", m));
  });

  it("quiz → question usable", async (ctx) => {
    const m = await measureConvex(() => t.query(api.respond.getPublicForm, { shareId: ws.quizzes[1].shareId }));
    const form = m.result as { state: string; definition?: { fields: unknown[] } };
    expect(form.state).toBe("open");
    recordPerf(ctx, journey("quizQuestion", m));
  });

  it("live game → joined", async (ctx) => {
    const token = "ab".repeat(16);
    const m = await measureConvex(async () => {
      const joined = await t.mutation(api.live.joinGame, { pin: ws.pin, nickname: "Late arrival", token });
      if (joined.status !== "joined") throw new Error(joined.status);
      return await t.query(api.live.playerView, { gameId: joined.gameId, token });
    });
    expect((m.result as { state: string }).state).toBe("lobby");
    recordPerf(ctx, journey("liveJoin", m));
  });

  it("MCP call → action persisted", async (ctx) => {
    const client = await connectMcp(convexMcpCaller(t, perfCreator.subject));
    const m = await measureConvex(() => client.callTool({ name: "create_form", arguments: {
      title: "Made by an assistant", questions: [{ type: "single_choice", label: "Pick one", options: ["A", "B"] }, { type: "short_text", label: "Why?" }],
    } }));
    expect(m.result.isError).toBeFalsy();
    // MCP ids are `form_<id>` (convex/mcp.ts); the dashboard must see the same form.
    const id = (m.result.structuredContent as { id: string }).id.replace(/^form_/, "") as Id<"forms">;
    const persisted = await ws.owner.query(api.forms.getFormForEditor, { formId: id });
    expect(persisted?.draft.fields.map((f) => f.label)).toEqual(["Pick one", "Why?"]);
    recordPerf(ctx, { ...journey("mcpPersist", m), "journey.mcpPersist.bytesWritten": { value: m.cost.bytesWritten, unit: "bytes" } });
  });
});
