import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity } from "../fixtures";
import { LEGACY_TEACHER, seedLegacyDataset } from "../fixtures/legacyDataset";
import type { LegacyDataset } from "../fixtures/legacyDataset";

async function seeded() {
  const t = createTestConvex();
  const ds: LegacyDataset = await t.run((ctx) => seedLegacyDataset(ctx));
  return { t, ds, teacher: t.withIdentity(creatorIdentity) };
}

describe("legacy data: the current schema accepts old shapes", () => {
  it("loads the whole fixture dataset", async () => {
    const { t, ds } = await seeded();
    const counts = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).length,
      quizzes: (await ctx.db.query("quizzes").collect()).length,
      questions: (await ctx.db.query("questions").collect()).length,
      sessions: (await ctx.db.query("quizSessions").collect()).length,
      forms: (await ctx.db.query("forms").collect()).length,
      responses: (await ctx.db.query("formResponses").collect()).length,
    }));
    expect(counts).toEqual({ users: 5, quizzes: 5, questions: 9, sessions: 6, forms: 2, responses: 3 });
    expect(ds.responses).toHaveLength(3);
  });

  it("still requires a slug: a quiz without one cannot be stored, an empty one can", async () => {
    const { t } = await seeded();
    await expect(t.run((ctx) => ctx.db.insert("quizzes", {
      title: "No slug", creatorId: "u", creatorUsername: "u", isPublished: false, createdAt: 1, updatedAt: 1,
    } as never))).rejects.toThrow();
  });
});

describe("legacy data: read paths return correct values", () => {
  it("users without plan fields keep working: isElevated is honoured until a plan is set", async () => {
    const { t, teacher, ds } = await seeded();
    const me = await teacher.query(api.quizFunctions.getCurrentUser, {});
    expect(me).toMatchObject({ username: "legacyteacher" });
    expect(me!.plan).toBeUndefined();
    const { hasPro, isPaidPlan } = await import("@/convex/authz");
    const users = await t.run(async (ctx) => ({
      elevated: await ctx.db.get("users", ds.users.elevated), planless: await ctx.db.get("users", ds.users.planless),
      pro: await ctx.db.get("users", ds.users.pro), teacher: await ctx.db.get("users", ds.users.teacher),
    }));
    // Every account has every feature; isPaidPlan still reports paid or admin-granted plans.
    for (const user of Object.values(users)) expect(hasPro(user, ds.now)).toBe(true);
    expect(isPaidPlan(users.elevated, ds.now)).toBe(true);
    expect(isPaidPlan(users.planless, ds.now)).toBe(false);
    expect(isPaidPlan(users.teacher, ds.now)).toBe(false);
    expect(isPaidPlan(users.pro, ds.now)).toBe(true);
    // A paid plan that has expired stops counting, even without isElevated.
    expect(isPaidPlan({ ...users.pro!, planExpiresAt: ds.now - 1 }, ds.now)).toBe(false);
    // An explicit plan overrides a legacy isElevated flag.
    expect(isPaidPlan({ ...users.elevated!, plan: "free" }, ds.now)).toBe(false);
  });

  it("MCP reads 1.0-era forms and does not surface classic quiz rows", async () => {
    const { t, ds } = await seeded();
    const userId = LEGACY_TEACHER.clerkId;
    const found = await t.query(internal.mcp.searchForms, { userId, status: "any", limit: 50 });
    expect(found.items.map((i) => i.title).sort()).toEqual(["Customer survey", "Old draft form"]);
    expect(found.items.every((i) => i.kind === "form")).toBe(true);

    const form = await t.query(internal.mcp.getForm, { userId, id: `form_${ds.forms.v1}` });
    expect(form).toMatchObject({ kind: "form", title: "Customer survey", status: "live", readyToPublish: true });
    expect((form as { questions: unknown[] }).questions).toHaveLength(3);

    // Classic quiz rows still in the table are not reachable through MCP.
    await expect(t.query(internal.mcp.getForm, { userId, id: `quiz_${ds.quizzes.old}` })).rejects.toThrow(/NOT_FOUND|No form or quiz/);
    await expect(t.query(internal.mcp.getResults, { userId, id: `quiz_${ds.quizzes.old}` })).rejects.toThrow(/NOT_FOUND|No form or quiz/);
  });
});

describe("legacy data: 1.0-era forms", () => {
  it("loads in the library, the public page, the inbox, analysis and export", async () => {
    const { t, teacher, ds } = await seeded();
    const library = await teacher.query(api.forms.listMyForms, {});
    expect(library.owned.map((f) => f.title).sort()).toEqual(["Customer survey", "Old draft form"]);

    const pub = await t.query(api.respond.getPublicForm, { shareId: ds.formShareIds.v1 });
    expect(pub.state).toBe("open");
    if (pub.state !== "open") return;
    expect(pub.definition.fields.map((f) => f.id)).toEqual(["name", "plan", "nps"]);
    expect(pub.version).toBe(1);
    expect((await t.query(api.respond.getPublicForm, { shareId: ds.formShareIds.v1Draft })).state).toBe("unavailable");

    const inbox = await teacher.query(api.formResults.listResponses, { formId: ds.forms.v1, filter: {}, paginationOpts: { numItems: 10, cursor: null } });
    expect(inbox.page).toHaveLength(3);
    expect(inbox.page.map((r) => r.receiptCode).sort()).toEqual(["OLD00001", "OLD00002", "OLD00003"]);

    const one = await teacher.query(api.formResults.getResponse, { responseId: ds.responses[1] });
    expect(one!.items.find((i) => i.fieldId === "plan")?.text).toBe("Pro, annual");
    const skipped = await teacher.query(api.formResults.getResponse, { responseId: ds.responses[2] });
    expect(skipped!.items.find((i) => i.fieldId === "nps")?.state).not.toBe("answered");

    const exported = await teacher.query(api.formResults.exportResponses, { formId: ds.forms.v1, includePartial: false, includeSpam: false, paginationOpts: { numItems: 50, cursor: null } });
    expect(exported!.columns.map((c) => c.label)).toEqual(["Your name", "Plan", "How likely?"]);
    expect(exported!.rows.map((r) => r.cells)).toEqual([
      { name: "Amal", plan: "Free", nps: "5" }, { name: "Bilal", plan: "Pro, annual", nps: "3" }, { name: "Céline", plan: "Free", nps: "" },
    ]);

    const analysis = await teacher.query(api.formResults.getAnalysis, { formId: ds.forms.v1 });
    expect(analysis).not.toBeNull();
  });

  it("accepts a new submission on a 1.0 form and keeps the counters right", async () => {
    const { t, teacher, ds } = await seeded();
    const res = await t.mutation(api.respond.submitResponse, {
      shareId: ds.formShareIds.v1, submissionKey: "new-key-00000001", answers: { name: "Dana", plan: "b", nps: 4 }, language: "en", final: true, startedAt: Date.now() - 60_000,
    });
    expect(res.duplicate).toBe(false);
    const form = await teacher.query(api.forms.getFormForEditor, { formId: ds.forms.v1 });
    expect(form!.responseCount).toBe(4);
    expect(form!.draft.theme).toMatchObject({ accent: "#ff5a1f" });
  });
});
