/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import {
  DAY,
  PRACTICE_LIMITS,
  summarizeEvidence,
} from "../../convex/learnPracticeModel";
import { defaultFormSettings } from "../../convex/formModel";
import { emptyDefinition, type FormDefinition } from "../../convex/formLogic";
import type { Id } from "../../convex/_generated/dataModel";
import type { MutationCtx } from "../../convex/_generated/server";

const modules = import.meta.glob("../../convex/**/*.*s");
const { mapField, ingestResponse, conceptStates, selectPractice } =
  api.learnPractice;
const identity = (subject: string, issuer = "https://chaos.test") => ({
  subject,
  issuer,
  tokenIdentifier: `${issuer}|${subject}`,
  email: `${subject}@school.edu`,
  emailVerified: true,
});
const now = 1_800_000_000_000;
function definition(correct = "a"): FormDefinition {
  const def = emptyDefinition("Quiz");
  def.quiz = { enabled: true };
  def.fields = ["q1", "q2"].map((id) => ({
    id,
    label: id,
    type: "choice",
    required: false,
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    quiz: {
      correctOptionIds: [correct],
      points: 2,
      explanation: "Private key",
    },
  }));
  return def;
}
async function setup(publishedDefinition: FormDefinition = definition()) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity(identity("owner")),
    other = t.withIdentity(identity("other"));
  const ids = await t.run(async (ctx) => {
    const conceptId = await ctx.db.insert("learnConcepts", {
      slug: "cells",
      title: "Cells",
      description: "",
      createdBy: "admin",
    });
    const concept2 = await ctx.db.insert("learnConcepts", {
      slug: "energy",
      title: "Energy",
      description: "",
      createdBy: "admin",
    });
    const formId = await ctx.db.insert("forms", {
      ownerId: "owner",
      title: "Quiz",
      shareId: "owned",
      status: "live",
      draft: publishedDefinition,
      draftRevision: 1,
      settings: {
        ...defaultFormSettings,
        access: "signed_in",
        notifyOnResponse: false,
      },
      publishedVersion: 1,
      responseCount: 0,
      partialCount: 0,
      createdAt: 0,
      updatedAt: 0,
    });
    const versionId = await ctx.db.insert("formVersions", {
      formId,
      version: 1,
      definition: publishedDefinition,
      publishedAt: 0,
      publishedBy: "owner",
      draftRevision: 1,
    });
    return { conceptId, concept2, formId, versionId };
  });
  const mapping = {
    formId: ids.formId,
    version: 1,
    fieldId: "q1",
    conceptId: ids.conceptId,
  };
  const response = async (
    overrides: Partial<Parameters<typeof insertResponse>[1]> = {},
  ) =>
    t.run((ctx) => insertResponse(ctx, { formId: ids.formId, ...overrides }));
  return { t, owner, other, ...ids, mapping, response };
}
async function insertResponse(
  ctx: Pick<MutationCtx, "db">,
  overrides: {
    formId: Id<"forms">;
    respondentId?: string | null;
    answers?: Record<string, string>;
    version?: number;
    status?: "completed" | "partial";
    submittedAt?: number;
  },
) {
  return ctx.db.insert("formResponses", {
    formId: overrides.formId,
    version: overrides.version ?? 1,
    status: overrides.status ?? "completed",
    answers: overrides.answers ?? { q1: "b", q2: "b" },
    respondentId:
      overrides.respondentId === null
        ? undefined
        : (overrides.respondentId ?? "owner"),
    language: "en",
    submissionKey: crypto.randomUUID(),
    receiptCode: "receipt",
    startedAt: now - 60_000,
    submittedAt: overrides.submittedAt ?? now - 1000,
    updatedAt: now - 1000,
    reviewed: false,
    // Persisted scores are deliberately spoofed; they must not drive evidence.
    quizScore: 9999,
    quizMaxScore: 9999,
    tags: [],
    spam: false,
    searchText: "",
  });
}
async function weak(s: Awaited<ReturnType<typeof setup>>) {
  await s.owner.mutation(mapField, s.mapping);
  for (let i = 0; i < 3; i++)
    await s.owner.mutation(ingestResponse, {
      formResponseId: await s.response({ submittedAt: now - (i + 1) * 1000 }),
    });
}

describe("version-stable private practice", () => {
  it("only owners map existing graded immutable fields/concepts; repeats reuse the mapping", async () => {
    const s = await setup();
    await expect(s.t.mutation(mapField, s.mapping)).rejects.toThrow(
      "Not authenticated",
    );
    await expect(s.other.mutation(mapField, s.mapping)).rejects.toThrow(
      "Form owner required",
    );
    for (const args of [
      { ...s.mapping, version: 2 },
      { ...s.mapping, fieldId: "missing" },
    ])
      await expect(s.owner.mutation(mapField, args)).rejects.toThrow(
        "Published graded quiz field",
      );
    const absent = await s.t.run(async (ctx) => {
      const id = await ctx.db.insert("learnConcepts", {
        slug: "deleted",
        title: "Deleted",
        description: "",
        createdBy: "admin",
      });
      await ctx.db.delete("learnConcepts", id);
      return id;
    });
    await expect(
      s.owner.mutation(mapField, { ...s.mapping, conceptId: absent }),
    ).rejects.toThrow("Existing concept required");
    const id = await s.owner.mutation(mapField, s.mapping);
    expect(await s.owner.mutation(mapField, s.mapping)).toBe(id);
    await s.t.run((ctx) =>
      ctx.db.patch("forms", s.formId, {
        draft: definition("b"),
        draftRevision: 2,
      }),
    );
    expect(await s.owner.mutation(mapField, s.mapping)).toBe(id);
    expect(
      await s.t.run((ctx) => ctx.db.query("learnPracticeMappings").collect()),
    ).toHaveLength(1);
  });

  it("denies other users, anonymous/unlinked/partial responses and legacy IDs, without writes", async () => {
    const s = await setup();
    await s.owner.mutation(mapField, s.mapping);
    const foreign = await s.response({ respondentId: "other" });
    await expect(
      s.owner.mutation(ingestResponse, { formResponseId: foreign }),
    ).rejects.toThrow("Own authenticated completed response");
    const own = await s.response();
    await expect(
      s.other.mutation(ingestResponse, { formResponseId: own }),
    ).rejects.toThrow("Own authenticated completed response");
    await expect(
      s.t.mutation(ingestResponse, { formResponseId: own }),
    ).rejects.toThrow("Not authenticated");
    for (const formResponseId of [
      await s.response({ respondentId: null }),
      await s.response({ status: "partial" }),
    ])
      await expect(
        s.owner.mutation(ingestResponse, { formResponseId }),
      ).rejects.toThrow("Own authenticated completed response");
    const legacy = await s.t.run(async (ctx) => {
      const quizId = await ctx.db.insert("quizzes", {
        title: "Legacy",
        slug: "legacy",
        creatorId: "owner",
        creatorUsername: "owner",
        isPublished: true,
        createdAt: 0,
        updatedAt: 0,
      });
      return ctx.db.insert("quizSessions", {
        quizId,
        playerName: "owner",
        score: 1,
        totalPoints: 1,
        answers: [],
        startedAt: 0,
        status: "completed",
      });
    });
    await expect(
      s.owner.mutation(ingestResponse, {
        formResponseId: legacy as unknown as Id<"formResponses">,
      }),
    ).rejects.toThrow();
    expect(
      await s.t.run((ctx) => ctx.db.query("learnPracticeEvidence").collect()),
    ).toEqual([]);
  });

  it("server-grades, rejects spoof arguments, upserts edited evidence without adding attempts", async () => {
    const s = await setup();
    await s.owner.mutation(mapField, s.mapping);
    const formResponseId = await s.response();
    await expect(
      s.owner.mutation(ingestResponse, {
        formResponseId,
        correctness: true,
      } as { formResponseId: typeof formResponseId }),
    ).rejects.toThrow();
    expect(await s.owner.mutation(ingestResponse, { formResponseId })).toEqual({
      evidenceCount: 1,
    });
    const first = (
      await s.t.run((ctx) => ctx.db.query("learnPracticeEvidence").collect())
    )[0];
    expect(first).toMatchObject({
      earned: 0,
      possible: 2,
      userId: identity("owner").tokenIdentifier,
    });
    await s.owner.mutation(ingestResponse, { formResponseId });
    await s.t.run((ctx) =>
      ctx.db.patch("formResponses", formResponseId, {
        answers: { q1: "a" },
        updatedAt: now,
        editedAt: now,
        editCount: 1,
        quizScore: -999,
      }),
    );
    await s.owner.mutation(ingestResponse, { formResponseId });
    const rows = await s.t.run((ctx) =>
      ctx.db.query("learnPracticeEvidence").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      _id: first._id,
      earned: 2,
      answeredAt: first.answeredAt,
      responseUpdatedAt: now,
    });
    expect(
      (
        await s.owner.query(conceptStates, { conceptIds: [s.conceptId], now })
      )[0],
    ).toMatchObject({ attempts: 1, accuracy: 1, state: "insufficient" });
    await s.t.run((ctx) =>
      ctx.db.patch("formResponses", formResponseId, {
        answers: {},
        updatedAt: now + 1,
      }),
    );
    expect(await s.owner.mutation(ingestResponse, { formResponseId })).toEqual({
      evidenceCount: 0,
    });
    expect(
      await s.t.run((ctx) => ctx.db.query("learnPracticeEvidence").collect()),
    ).toHaveLength(0);
  });

  it("grades old responses against their old version and never applies another version's mapping", async () => {
    const s = await setup();
    await s.owner.mutation(mapField, s.mapping);
    await s.t.run(async (ctx) => {
      await ctx.db.insert("formVersions", {
        formId: s.formId,
        version: 2,
        definition: definition("b"),
        publishedAt: now,
        publishedBy: "owner",
        draftRevision: 2,
      });
      await ctx.db.patch("forms", s.formId, {
        draft: definition("b"),
        publishedVersion: 2,
      });
    });
    await s.owner.mutation(mapField, {
      ...s.mapping,
      version: 2,
      conceptId: s.concept2,
    });
    const old = await s.response({ answers: { q1: "a" } }),
      newer = await s.response({ version: 2, answers: { q1: "a" } });
    await s.owner.mutation(ingestResponse, { formResponseId: old });
    await s.owner.mutation(ingestResponse, { formResponseId: newer });
    const rows = await s.t.run((ctx) =>
      ctx.db.query("learnPracticeEvidence").collect(),
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((e) => e.formResponseId === old)).toMatchObject({
      version: 1,
      conceptId: s.conceptId,
      earned: 2,
    });
    expect(rows.find((e) => e.formResponseId === newer)).toMatchObject({
      version: 2,
      conceptId: s.concept2,
      earned: 0,
    });
    const missing = await s.response({ version: 3 });
    await expect(
      s.owner.mutation(ingestResponse, { formResponseId: missing }),
    ).rejects.toThrow("Matching immutable");
  });

  it("does not ingest fields hidden by server branching", async () => {
    const def = definition();
    def.fields[1].showIf = {
      match: "all",
      conditions: [{ fieldId: "q1", op: "equals", value: "a" }],
    };
    const s = await setup(def);
    await s.owner.mutation(mapField, { ...s.mapping, fieldId: "q2" });
    const id = await s.response({ answers: { q1: "a", q2: "b" } });
    await s.owner.mutation(ingestResponse, { formResponseId: id });
    await s.t.run((ctx) =>
      ctx.db.patch("formResponses", id, {
        answers: { q1: "b", q2: "a" },
        updatedAt: now,
      }),
    );
    expect(
      await s.owner.mutation(ingestResponse, { formResponseId: id }),
    ).toEqual({ evidenceCount: 0 });
  });

  it("returns private bounded explainable states with explicit time and independent response counts", async () => {
    const s = await setup();
    await weak(s);
    await s.owner.mutation(mapField, { ...s.mapping, fieldId: "q2" });
    const ids = await s.t.run((ctx) => ctx.db.query("formResponses").collect());
    for (const r of ids)
      await s.owner.mutation(ingestResponse, { formResponseId: r._id });
    expect(
      (
        await s.owner.query(conceptStates, { conceptIds: [s.conceptId], now })
      )[0],
    ).toMatchObject({
      attempts: 3,
      state: "weak",
      confidence: "low",
      accuracy: 0,
      ageMs: 1000,
    });
    expect(
      (
        await s.other.query(conceptStates, { conceptIds: [s.conceptId], now })
      )[0],
    ).toMatchObject({ attempts: 0, state: "insufficient" });
    const sameSubjectDifferentIssuer = s.t.withIdentity(
      identity("owner", "https://another.test"),
    );
    expect(
      (
        await sameSubjectDifferentIssuer.query(conceptStates, {
          conceptIds: [s.conceptId],
          now,
        })
      )[0].attempts,
    ).toBe(0);
    expect(
      (
        await s.owner.query(conceptStates, {
          conceptIds: [s.conceptId],
          now: now + 8 * DAY,
        })
      )[0].state,
    ).toBe("review");
    expect(
      (
        await s.owner.query(conceptStates, {
          conceptIds: [s.conceptId],
          now: now + 31 * DAY,
        })
      )[0],
    ).toMatchObject({ state: "insufficient", attempts: 0, ageMs: null });
    await expect(
      s.t.query(conceptStates, { conceptIds: [s.conceptId], now }),
    ).rejects.toThrow("Not authenticated");
    await expect(
      s.owner.query(conceptStates, { conceptIds: [s.conceptId], now: NaN }),
    ).rejects.toThrow("Invalid now");
    await expect(
      s.owner.query(conceptStates, {
        conceptIds: [s.conceptId, s.conceptId],
        now,
      }),
    ).rejects.toThrow("unique concepts");
    const rows = Array.from({ length: 80 }, (_, i) => ({
      formResponseId: String(i),
      earned: 0,
      possible: 2,
      answeredAt: now - i,
    }));
    expect(summarizeEvidence(s.conceptId, rows, now)).toMatchObject({
      attempts: PRACTICE_LIMITS.recentEvidence,
      confidence: "moderate",
    });
  });

  it("selects current owned weak-concept references, prefers unanswered fields and never returns keys", async () => {
    const s = await setup();
    await weak(s);
    await s.owner.mutation(mapField, { ...s.mapping, fieldId: "q2" });
    const selected = await s.owner.query(selectPractice, {
      conceptIds: [s.conceptId],
      now,
      limit: 2,
    });
    expect(selected).toEqual([
      {
        formId: s.formId,
        version: 1,
        fieldId: "q2",
        conceptIds: [s.conceptId],
        recentlyAnswered: false,
      },
      {
        formId: s.formId,
        version: 1,
        fieldId: "q1",
        conceptIds: [s.conceptId],
        recentlyAnswered: true,
      },
    ]);
    expect(JSON.stringify(selected)).not.toMatch(
      /correctOptionIds|explanation|definition|earned|answers/,
    );
    expect(
      await s.other.query(selectPractice, { conceptIds: [s.conceptId], now }),
    ).toEqual([]);
    expect(
      await s.owner.query(selectPractice, { conceptIds: [s.concept2], now }),
    ).toEqual([]);
    await s.t.run(async (ctx) => {
      await ctx.db.insert("formVersions", {
        formId: s.formId,
        version: 2,
        definition: definition("b"),
        publishedAt: now,
        publishedBy: "owner",
        draftRevision: 2,
      });
      await ctx.db.patch("forms", s.formId, { publishedVersion: 2 });
    });
    expect(
      await s.owner.query(selectPractice, { conceptIds: [s.conceptId], now }),
    ).toEqual([]);
    await s.owner.mutation(mapField, { ...s.mapping, version: 2 });
    expect(
      await s.owner.query(selectPractice, { conceptIds: [s.conceptId], now }),
    ).toEqual([
      {
        formId: s.formId,
        version: 2,
        fieldId: "q1",
        conceptIds: [s.conceptId],
        recentlyAnswered: false,
      },
    ]);
  });

  it("enforces collection restrictions even for owned forms and excludes private assessments of others", async () => {
    const s = await setup();
    await weak(s);
    const select = () =>
      s.owner.query(selectPractice, { conceptIds: [s.conceptId], now });
    const form = await s.t.run((ctx) => ctx.db.get("forms", s.formId));
    for (const patch of [
      { status: "closed" as const },
      { status: "draft" as const },
      { status: "archived" as const },
      { isBanned: true },
      {
        settings: {
          ...form!.settings,
          access: "code" as const,
          accessCodeHash: "secret",
        },
      },
      { settings: { ...form!.settings, allowedEmails: ["other@school.edu"] } },
      { settings: { ...form!.settings, opensAt: now + 1 } },
      { settings: { ...form!.settings, closesAt: now } },
      { settings: { ...form!.settings, responseLimit: 0 } },
      { settings: { ...form!.settings, onePerPerson: true } },
      { ownerId: "other" },
      { responseCount: 1000 },
    ]) {
      await s.t.run((ctx) => ctx.db.patch("forms", s.formId, patch));
      expect(await select()).toEqual([]);
      await s.t.run((ctx) =>
        ctx.db.replace(
          "forms",
          s.formId,
          (({ _id, _creationTime, ...data }) => data)(form!),
        ),
      );
    }
    expect(await select()).toHaveLength(1);
    expect(
      await s.t
        .withIdentity({ ...identity("owner"), emailVerified: false })
        .query(selectPractice, { conceptIds: [s.conceptId], now }),
    ).toHaveLength(1);
    await s.t.run((ctx) =>
      ctx.db.patch("forms", s.formId, {
        settings: { ...form!.settings, allowedDomains: ["school.edu"] },
      }),
    );
    expect(
      await s.t
        .withIdentity({ ...identity("owner"), emailVerified: false })
        .query(selectPractice, { conceptIds: [s.conceptId], now }),
    ).toEqual([]);
    await s.t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "owner",
        name: "Owner",
        email: "owner@school.edu",
        username: "owner",
        createdAt: 0,
        isBanned: true,
      }),
    );
    await expect(select()).rejects.toThrow("ACCOUNT_BANNED");
    await s.t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", "owner"))
        .unique();
      await ctx.db.patch("users", user!._id, { isBanned: false });
    });
    await expect(
      s.t.query(selectPractice, { conceptIds: [s.conceptId], now }),
    ).rejects.toThrow("Not authenticated");
    await expect(
      s.owner.query(selectPractice, {
        conceptIds: [s.conceptId],
        now,
        limit: 1000,
      }),
    ).rejects.toThrow("Invalid selection limit");
  });
  it("lets a respondent ingest their own evidence without ownership and keeps other assessments out of selection", async () => {
    const s = await setup();
    await s.owner.mutation(mapField, s.mapping);
    for (let i = 0; i < 3; i++) {
      const id = await s.response({ respondentId: "other" });
      expect(
        await s.other.mutation(ingestResponse, { formResponseId: id }),
      ).toEqual({ evidenceCount: 1 });
    }
    expect(
      (
        await s.other.query(conceptStates, { conceptIds: [s.conceptId], now })
      )[0],
    ).toMatchObject({ state: "weak", attempts: 3 });
    expect(
      (
        await s.owner.query(conceptStates, { conceptIds: [s.conceptId], now })
      )[0].attempts,
    ).toBe(0);
    expect(
      await s.other.query(selectPractice, { conceptIds: [s.conceptId], now }),
    ).toEqual([]);
  });

  it("deduplicates references across concepts and enforces the per-version mapping bound", async () => {
    const s = await setup();
    await weak(s);
    await s.owner.mutation(mapField, { ...s.mapping, conceptId: s.concept2 });
    const responses = await s.t.run((ctx) =>
      ctx.db.query("formResponses").collect(),
    );
    for (const response of responses)
      await s.owner.mutation(ingestResponse, { formResponseId: response._id });
    expect(
      await s.owner.query(selectPractice, {
        conceptIds: [s.conceptId, s.concept2],
        now,
      }),
    ).toEqual([
      {
        formId: s.formId,
        version: 1,
        fieldId: "q1",
        conceptIds: [s.conceptId, s.concept2],
        recentlyAnswered: true,
      },
    ]);
    await s.t.run(async (ctx) => {
      for (let i = 2; i < PRACTICE_LIMITS.mappingsPerVersion; i++) {
        const conceptId = await ctx.db.insert("learnConcepts", {
          slug: `bound-${i}`,
          title: `Bound ${i}`,
          description: "",
          createdBy: "admin",
        });
        await ctx.db.insert("learnPracticeMappings", {
          ownerId: "owner",
          formId: s.formId,
          version: 1,
          fieldId: "q1",
          conceptId,
        });
      }
    });
    await expect(
      s.owner.mutation(mapField, { ...s.mapping, fieldId: "q2" }),
    ).rejects.toThrow("Version mapping limit reached");
    const id = await s.response();
    expect(
      await s.owner.mutation(ingestResponse, { formResponseId: id }),
    ).toEqual({ evidenceCount: PRACTICE_LIMITS.mappingsPerVersion });
    expect(
      await s.owner.mutation(ingestResponse, { formResponseId: id }),
    ).toEqual({ evidenceCount: PRACTICE_LIMITS.mappingsPerVersion });
    const rows = await s.t.run((ctx) =>
      ctx.db
        .query("learnPracticeEvidence")
        .withIndex(
          "by_userId_and_formResponseId_and_fieldId_and_conceptId",
          (q) =>
            q
              .eq("userId", identity("owner").tokenIdentifier)
              .eq("formResponseId", id),
        )
        .collect(),
    );
    expect(rows).toHaveLength(PRACTICE_LIMITS.mappingsPerVersion);
  });
  it("cannot use a forged clock to bypass schedules or expired plan caps; active-user restrictions apply", async () => {
    const s = await setup();
    await s.owner.mutation(mapField, s.mapping);
    for (let i = 0; i < 3; i++)
      await s.owner.mutation(ingestResponse, {
        formResponseId: await s.response({ submittedAt: now - 10_000 - i }),
      });
    const form = await s.t.run((ctx) => ctx.db.get("forms", s.formId));
    const select = (clock = now) =>
      s.owner.query(selectPractice, { conceptIds: [s.conceptId], now: clock });
    expect(await select()).toHaveLength(1);
    await s.t.run((ctx) =>
      ctx.db.patch("forms", s.formId, {
        settings: { ...form!.settings, opensAt: now + 30_000 },
      }),
    );
    expect(await select(now + 60_000)).toEqual([]);
    await s.t.run((ctx) =>
      ctx.db.patch("forms", s.formId, {
        settings: { ...form!.settings, closesAt: now - 1000 },
      }),
    );
    expect(await select(now - 2000)).toEqual([]);
    const userId = await s.t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "owner",
        name: "Owner",
        username: "owner",
        email: "owner@school.edu",
        createdAt: 0,
        plan: "pro",
        planExpiresAt: now - 1000,
      }),
    );
    await s.t.run((ctx) =>
      ctx.db.patch("forms", s.formId, {
        settings: form!.settings,
        responseCount: 1000,
      }),
    );
    // Moving back before expiry cannot acquire a Pro response-cap exemption.
    expect(await select(now - 2000)).toEqual([]);
    await s.t.run((ctx) =>
      ctx.db.patch("users", userId, { suspendedUntil: now + DAY }),
    );
    await expect(select()).rejects.toThrow("ACCOUNT_SUSPENDED");
    await expect(
      s.owner.query(conceptStates, { conceptIds: [s.conceptId], now }),
    ).rejects.toThrow("ACCOUNT_SUSPENDED");
    await expect(s.owner.mutation(mapField, s.mapping)).rejects.toThrow(
      "ACCOUNT_SUSPENDED",
    );
    await expect(
      s.owner.mutation(ingestResponse, { formResponseId: await s.response() }),
    ).rejects.toThrow("ACCOUNT_SUSPENDED");
  });
});
