import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

const owner = creatorIdentity.subject;
const quizInput = {
  title: "What we discussed",
  quizMode: true,
  questions: [
    { type: "single_choice", label: "Largest planet?", options: ["Mars", "Jupiter"], correctAnswers: ["Jupiter"], points: 2 },
    { type: "short_text", label: "Your name" },
  ],
};

async function setup() {
  const t = createTestConvex();
  await t.mutation(internal.mcp.begin, { userId: owner, profile: { name: "Casey", email: creatorIdentity.email } });
  return t;
}

describe("ChatGPT app backend", () => {
  it("creates the account on first use and refuses unknown accounts without a profile", async () => {
    const t = createTestConvex();
    await expect(t.mutation(internal.mcp.begin, { userId: "user_new" })).rejects.toThrow(/ACCOUNT_REQUIRED/);
    await t.mutation(internal.mcp.begin, { userId: "user_new", profile: { name: "New", email: "new@example.com" } });
    const user = await t.run((ctx) => ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", "user_new")).first());
    expect(user?.email).toBe("new@example.com");
  });

  it("creates a quiz that keeps its answers hidden after submitting, and turns them back on", async () => {
    const t = await setup();
    const created = await t.mutation(internal.mcp.createForm, { userId: owner, input: { ...quizInput, showAnswers: false } });
    const form = (await t.query(internal.mcp.getForm, { userId: owner, id: created.id })) as { revision: number; showAnswers?: boolean };
    expect(form.showAnswers).toBe(false);
    await t.mutation(internal.mcp.updateForm, { userId: owner, id: created.id, expectedRevision: form.revision, input: { showAnswers: true } });
    expect(((await t.query(internal.mcp.getForm, { userId: owner, id: created.id })) as { showAnswers?: boolean }).showAnswers).toBe(true);
  });

  it("creates a quiz draft, edits it, publishes it and summarizes results", async () => {
    const t = await setup();
    const created = await t.mutation(internal.mcp.createForm, { userId: owner, input: quizInput });
    expect(created).toMatchObject({ kind: "form", status: "draft", quizMode: true, readyToPublish: true, shareUrl: null });
    expect(created.editUrl).toMatch(/\/dashboard\/forms\//);

    const form = (await t.query(internal.mcp.getForm, { userId: owner, id: created.id })) as { revision: number; questions: { id: string }[] };
    expect(form.questions[0]).toMatchObject({ correctAnswers: ["Jupiter"], points: 2 });

    const questions = [...(form.questions as object[]), { type: "rating", label: "How fun?" }];
    await expect(t.mutation(internal.mcp.updateForm, { userId: owner, id: created.id, expectedRevision: 99, input: { questions } })).rejects.toThrow(/DRAFT_CONFLICT/);
    const updated = await t.mutation(internal.mcp.updateForm, { userId: owner, id: created.id, expectedRevision: form.revision, input: { questions } });
    expect(updated.revision).toBe(form.revision + 1);

    const published = await t.mutation(internal.mcp.publishForm, { userId: owner, id: created.id });
    expect(published.status).toBe("live");
    expect(published.shareUrl).toMatch(/\/f\//);

    const shareId = published.shareUrl!.split("/f/")[1];
    const jupiter = (await t.run((ctx) => ctx.db.query("forms").first()))!.draft.fields[0].options!.find((o) => o.label === "Jupiter")!.id;
    await t.mutation(api.respond.submitResponse, {
      shareId, submissionKey: "mcp-test-0001", answers: { [form.questions[0].id]: jupiter, [form.questions[1].id]: "Sam" },
      language: "en", final: true, startedAt: Date.now() - 30_000,
    });
    const results = await t.query(internal.mcp.getResults, { userId: owner, id: created.id });
    expect(results).toMatchObject({ responses: 1, quiz: { averageScore: 2, maxScore: 2, averagePercent: 100 } });
    const responses = await t.query(internal.mcp.listResponses, { userId: owner, id: created.id });
    expect((responses.responses[0] as { answers: Record<string, string> }).answers).toMatchObject({ "Largest planet?": "Jupiter", "Your name": "Sam" });

    const found = await t.query(internal.mcp.searchForms, { userId: owner, query: "discussed" });
    expect(found.items.map((i) => i.id)).toEqual([created.id]);

    const closed = await t.mutation(internal.mcp.setFormStatus, { userId: owner, id: created.id, action: "close" });
    expect(closed.status).toBe("closed");
    await t.mutation(internal.mcp.setFormStatus, { userId: owner, id: created.id, action: "archive" });
    expect((await t.query(internal.mcp.searchForms, { userId: owner })).total).toBe(0);
    expect((await t.query(internal.mcp.searchForms, { userId: owner, status: "archived" })).total).toBe(1);
  });

  it("never reaches another person's forms and blocks writes for restricted accounts", async () => {
    const t = await setup();
    const created = await t.mutation(internal.mcp.createForm, { userId: owner, input: quizInput });
    const other = otherCreatorIdentity.subject;
    await t.mutation(internal.mcp.begin, { userId: other, profile: { name: "Riley", email: otherCreatorIdentity.email } });
    await expect(t.query(internal.mcp.getForm, { userId: other, id: created.id })).rejects.toThrow(/NOT_FOUND/);
    await expect(t.mutation(internal.mcp.publishForm, { userId: other, id: created.id })).rejects.toThrow(/NOT_FOUND/);
    expect((await t.query(internal.mcp.searchForms, { userId: other })).total).toBe(0);

    await t.run(async (ctx) => {
      const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", owner)).first();
      await ctx.db.patch("users", user!._id, { isBanned: true });
    });
    await expect(t.mutation(internal.mcp.createForm, { userId: owner, input: quizInput })).rejects.toThrow(/ACCOUNT_RESTRICTED/);
    expect((await t.query(internal.mcp.getForm, { userId: owner, id: created.id })).title).toBe("What we discussed");
  });

  it("works on every plan, including Personal and expired paid plans", async () => {
    const t = await setup();
    // A new account is on the 30-day Pro trial, so begin() succeeded in setup().
    await t.run(async (ctx) => {
      const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", owner)).first();
      await ctx.db.patch("users", user!._id, { plan: "free", planExpiresAt: undefined, isElevated: false });
    });
    await expect(t.mutation(internal.mcp.begin, { userId: owner })).resolves.toBeNull();
    await t.run(async (ctx) => {
      const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", owner)).first();
      await ctx.db.patch("users", user!._id, { plan: "pro", planExpiresAt: Date.now() - 1 });
    });
    await expect(t.mutation(internal.mcp.begin, { userId: owner })).resolves.toBeNull();
  });

  it("styles a draft: theme, sound and warnings, on drafts and published forms, with the usual access rules", async () => {
    const t = await setup();
    const created = await t.mutation(internal.mcp.createForm, { userId: owner, input: { ...quizInput, sound: "wood" } });
    expect(created.theme).toMatchObject({ preset: "flow", sound: "wood" });
    const plain = await t.mutation(internal.mcp.createForm, { userId: owner, input: quizInput });
    expect(plain.theme).toMatchObject({ preset: "flow", sound: "soft" });

    const rev = (await t.query(internal.mcp.getForm, { userId: owner, id: created.id })) as { revision: number; theme: { preset: string } };
    expect(rev.theme.preset).toBe("flow");
    const styled = await t.mutation(internal.mcp.updateForm, {
      userId: owner, id: created.id, expectedRevision: rev.revision,
      input: { theme: { accent: "#f0ebf9", font: "serif" } },
    });
    expect(styled.revision).toBe(rev.revision + 1);
    expect(styled.theme).toMatchObject({ preset: "flow", accent: "#f0ebf9", font: "serif", sound: "wood" });
    expect(styled.warnings.join(" ")).toMatch(/Accent on page/);
    await expect(t.mutation(internal.mcp.updateForm, { userId: owner, id: created.id, expectedRevision: 1, input: { sound: "pop" } })).rejects.toThrow(/DRAFT_CONFLICT/);
    await expect(t.mutation(internal.mcp.updateForm, { userId: owner, id: created.id, input: { theme: { accent: "nope" } } })).rejects.toThrow(/VALIDATION_FAILED/);
    // Questions are untouched.
    expect((await t.query(internal.mcp.getForm, { userId: owner, id: created.id }) as { questions: unknown[] }).questions).toHaveLength(2);

    // Published forms: the draft changes, respondents keep the live version.
    await t.mutation(internal.mcp.publishForm, { userId: owner, id: created.id });
    const after = await t.mutation(internal.mcp.updateForm, { userId: owner, id: created.id, input: { sound: "off" } });
    expect(after.theme.sound).toBe("off");
    expect(after.hasUnpublishedChanges).toBe(true);
    expect(after.notes.join(" ")).toMatch(/live version/);
    const live = (await t.run((ctx) => ctx.db.query("formVersions").first()))!.definition;
    expect(live.theme.sound).toBe("wood");

    // Other accounts, restricted accounts and archived forms are refused.
    const other = otherCreatorIdentity.subject;
    await t.mutation(internal.mcp.begin, { userId: other, profile: { name: "Riley", email: otherCreatorIdentity.email } });
    await expect(t.mutation(internal.mcp.updateForm, { userId: other, id: created.id, input: { sound: "pop" } })).rejects.toThrow(/NOT_FOUND/);
    await t.mutation(internal.mcp.setFormStatus, { userId: owner, id: plain.id, action: "archive" });
    await expect(t.mutation(internal.mcp.updateForm, { userId: owner, id: plain.id, input: { sound: "pop" } })).rejects.toThrow(/FORM_ARCHIVED/);
    await t.run(async (ctx) => {
      const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", owner)).first();
      await ctx.db.patch("users", user!._id, { isBanned: true });
    });
    await expect(t.mutation(internal.mcp.updateForm, { userId: owner, id: created.id, input: { sound: "pop" } })).rejects.toThrow(/ACCOUNT_RESTRICTED/);
  });

  it("rejects invalid answer keys", async () => {
    const t = await setup();
    await expect(t.mutation(internal.mcp.createForm, { userId: owner, input: {
      title: "Bad", quizMode: true, questions: [{ type: "single_choice", label: "Q", options: ["A", "B"], correctAnswers: ["C"] }],
    } })).rejects.toThrow(/VALIDATION_FAILED/);
  });

  it("grants and revokes admin from the Convex CLI only", async () => {
    const t = await setup();
    const admin = t.withIdentity(creatorIdentity);
    expect(await admin.query(api.quizFunctions.getIsAdmin, {})).toBe(false);
    await expect(t.mutation(internal.admin.grantAdmin, { email: "nobody@example.com" })).rejects.toThrow(/USER_NOT_FOUND/);
    // An unverified first-use address cannot be granted admin; a verified one can.
    await expect(t.mutation(internal.admin.grantAdmin, { email: creatorIdentity.email })).rejects.toThrow(/USER_NOT_FOUND/);
    await t.withIdentity({ ...creatorIdentity, subject: owner, emailVerified: true }).mutation(api.quizFunctions.getOrCreateUser, {});
    expect(await t.mutation(internal.admin.grantAdmin, { email: creatorIdentity.email.toUpperCase() })).toEqual({ clerkId: owner, alreadyAdmin: false });
    expect(await admin.query(api.quizFunctions.getIsAdmin, {})).toBe(true);
    expect(await t.mutation(internal.admin.revokeAdmin, { email: creatorIdentity.email })).toBe(1);
    expect(await admin.query(api.quizFunctions.getIsAdmin, {})).toBe(false);
  });
});
