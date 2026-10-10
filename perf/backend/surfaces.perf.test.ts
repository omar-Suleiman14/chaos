import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "@/tests/integration/setup";
import { measureConvex, readMetrics } from "../lib/convex";
import { perfCreator, perfStudent, resumeClock, seedWorkspace, signIn, WORKSPACE, type T } from "../lib/fixtures";
import { connectMcp, convexMcpCaller } from "../lib/mcp";
import { bytes, payloadBytes, recordPerf } from "../lib/record";

/**
 * Read budgets for the first screen of every major surface, against one
 * seeded workspace (perf/lib/fixtures.ts). Each surface lists the queries its
 * page subscribes to on load, so a page that adds a broad subscription or a
 * query that starts scanning more documents shows up here.
 */
let t: T;
let ws: Awaited<ReturnType<typeof seedWorkspace>>;

// The fake clock from tests/integration/setup.ts is per test; seeding once keeps the suite fast.
beforeAll(async () => {
  t = createTestConvex();
  ws = await seedWorkspace(t);
});
beforeEach(resumeClock);

const all = <T,>(calls: (() => Promise<T>)[]) => async () => { const out: T[] = []; for (const call of calls) out.push(await call()); return out; };

describe("surface read budgets", () => {
  it("dashboard", async (ctx) => {
    const m = await measureConvex(all<unknown>([
      () => ws.owner.query(api.quizFunctions.getIsAdmin, {}),
      () => ws.owner.query(api.quizFunctions.getCurrentUser, {}),
      () => ws.owner.query(api.forms.listMyForms, {}),
      () => ws.owner.query(api.courses.listMine, {}),
      () => ws.owner.query(api.live.myGames, {}),
    ]));
    expect((m.result[2] as { owned: unknown[] }).owned.length).toBe(WORKSPACE.forms + WORKSPACE.quizzes);
    recordPerf(ctx, { ...readMetrics("dashboard", m), "dashboard.subscriptions": m.cost.transactions });
  });

  it("forms editor", async (ctx) => {
    const formId = ws.forms[0].formId;
    const m = await measureConvex(() => ws.owner.query(api.forms.getFormForEditor, { formId }));
    expect(m.result?.draft.fields.length).toBeGreaterThan(0);
    recordPerf(ctx, readMetrics("forms.editor", m));
  });

  it("quiz respondent", async (ctx) => {
    const m = await measureConvex(() => t.query(api.respond.getPublicForm, { shareId: ws.quizzes[0].shareId }));
    expect(m.result).not.toBeNull();
    recordPerf(ctx, readMetrics("quizzes.respondent", m));
  });

  it("lesson editor and reader", async (ctx) => {
    const id = ws.lessons[0];
    const editor = await measureConvex(() => ws.owner.query(api.learnFrontend.editableLesson, { id }));
    const reader = await measureConvex(all<unknown>([
      () => t.query(api.learnFrontend.publicLesson, { id }),
      () => t.query(api.courses.courseForLesson, { lessonId: id }),
      () => t.query(api.learnFrontend.attachedQuizzes, { lessonId: id }),
    ]));
    expect(editor.result?.draft.blocks.length).toBe(WORKSPACE.lessonBlocks);
    recordPerf(ctx, { ...readMetrics("lessons.editor", editor), ...readMetrics("lessons.reader", reader) });
  });

  it("course editor and public course", async (ctx) => {
    const courseId = ws.course.courseId;
    const editor = await measureConvex(all<unknown>([
      () => ws.owner.query(api.courses.get, { courseId }),
      () => ws.owner.query(api.businessTeams.list, {}),
    ]));
    const reader = await measureConvex(() => t.query(api.courses.getPublic, { courseId }));
    expect(reader.result?.lessons.length).toBe(7);
    recordPerf(ctx, { ...readMetrics("courses.editor", editor), ...readMetrics("courses.public", reader) });
  });

  it("live host and player", async (ctx) => {
    const host = await measureConvex(() => ws.owner.query(api.live.hostView, { gameId: ws.gameId }));
    const player = await measureConvex(() => t.query(api.live.playerView, { gameId: ws.gameId, token: ws.players[0] }));
    expect(host.result?.players.length).toBe(WORKSPACE.livePlayers);
    recordPerf(ctx, { ...readMetrics("live.host", host), ...readMetrics("live.player", player) });
  });

  it("card", async (ctx) => {
    const own = await measureConvex(() => ws.owner.query(api.memberCards.mine, {}));
    const pub = await measureConvex(() => t.query(api.memberCards.byUsername, { username: "perry" }));
    expect(pub.result).not.toBeNull();
    recordPerf(ctx, { ...readMetrics("card.mine", own), ...readMetrics("card.public", pub) });
  });

  it("MCP tool listing and reads", async (ctx) => {
    const listing = await (await connectMcp(null)).listTools();
    const adminListing = await (await connectMcp(null, true)).listTools();
    // The biggest single tool definition: what one bloated description or schema costs every client.
    const largest = Math.max(...listing.tools.map((tool) => payloadBytes(tool)));
    await signIn(t, perfStudent);
    const client = await connectMcp(convexMcpCaller(t, perfCreator.subject));
    // Each HTTP request records telemetry to a random one of 16 hourly shards
    // (lib/backendTelemetry.ts). A call that lands on a shard an earlier call
    // already used reads that row too, so ~1 run in 16 counted two extra reads.
    // Give each measured request its own shard so the counts are deterministic.
    let shard = 0;
    const random = crypto.getRandomValues.bind(crypto);
    const shards = vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: ArrayBufferView<ArrayBuffer>) => {
      if (array instanceof Uint32Array && array.length === 1) { array[0] = shard++; return array; }
      return random(array);
    }) as typeof crypto.getRandomValues);
    let search, lesson;
    try {
      search = await measureConvex(() => client.callTool({ name: "search_forms", arguments: {} }));
      lesson = await measureConvex(() => client.callTool({ name: "get_lesson", arguments: { lessonId: ws.lessons[0], view: "draft" } }));
    } finally {
      shards.mockRestore();
    }
    expect(shard).toBe(2);
    expect(search.result.isError).toBeFalsy();
    expect(lesson.result.isError).toBeFalsy();
    recordPerf(ctx, {
      "mcp.tools": listing.tools.length,
      "mcp.listToolsBytes": bytes(payloadBytes(listing)),
      "mcp.admin.tools": adminListing.tools.length,
      "mcp.admin.listToolsBytes": bytes(payloadBytes(adminListing)),
      "mcp.largestToolBytes": bytes(largest),
      ...readMetrics("mcp.searchForms", search),
      ...readMetrics("mcp.getLesson", lesson),
    });
  });
});
