/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "@/convex/schema";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { emptyDefinition } from "@/convex/formLogic";
import type { Answers, FormDefinition } from "@/convex/formLogic";
import { defaultFormSettings } from "@/convex/formModel";
import { sha256Hex } from "@/convex/serverUtils";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import "./setup";

const modules = import.meta.glob("../../convex/**/*.*s");
// These regressions enforce production transaction limits, unlike the legacy suite factory.
const testConvex = () => convexTest({ schema, modules, transactionLimits: true });
type Test = ReturnType<typeof testConvex>;
const DAY = 86_400_000;
const token = "a".repeat(40);

function definition(files = 1): FormDefinition {
  const def = emptyDefinition("Respondent hardening");
  def.fields = [
    { id: "text", type: "textarea", label: "Your answer", required: false },
    ...Array.from({ length: files }, (_, i) => ({ id: `file${i}`, type: "file" as const, label: `File ${i}`, required: false, max: 5 })),
  ];
  return def;
}

async function publish(t: Test, def = definition()) {
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: def });
  const form = (await owner.query(api.forms.getFormForEditor, { formId }))!;
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: form.draftRevision });
  return { owner, formId, shareId: form.shareId };
}

function submission(shareId: string, key: string, answers: Answers = { text: "Saved answer" }, final = true) {
  return { shareId, submissionKey: key, answers, language: "en" as const, final, startedAt: Date.now() - 60_000 };
}

async function blob(t: Test, text = "file") {
  return await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob([text], { type: "text/plain" }));
    // convex-test 0.0.60's storeBlob omits MIME metadata; native uploads include it.
    const storageFixture = ctx.db as unknown as { patch(id: Id<"_storage">, fields: { contentType: string }): Promise<void> };
    await storageFixture.patch(id, { contentType: "text/plain" });
    return id;
  });
}

async function ticket(t: Test, shareId: string, fieldId = "file0") {
  const url = await t.mutation(api.respond.generateUploadUrl, { shareId, fieldId });
  return new URL(url, "https://example.test").searchParams.get("ticket")!;
}

/** What the upload endpoint does after storing the body. */
async function register(t: Test, shareId: string, storageId: Id<"_storage">, fieldId = "file0") {
  const token = await ticket(t, shareId, fieldId);
  return await t.mutation(internal.respond.recordUpload, { token, storageId, name: "answer.txt", contentType: "text/plain", size: 4 });
}

const finish = (t: Test) => t.finishAllScheduledFunctions(() => vi.runAllTimers(), 1000);

describe("respondent completion enforcement", () => {
  it("finds a completion behind five partials and permits an idempotent retry", async () => {
    const t = testConvex();
    const { owner, formId, shareId } = await publish(t);
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, access: "signed_in", onePerPerson: true, collectPartial: true } });
    const person = t.withIdentity(otherCreatorIdentity);
    for (let i = 0; i < 5; i++) await person.mutation(api.respond.submitResponse, submission(shareId, `partial-${i}`, {}, false));
    const first = await person.mutation(api.respond.submitResponse, submission(shareId, "completed-first"));
    expect(await person.query(api.respond.getPublicForm, { shareId })).toMatchObject({ state: "open", alreadyResponded: true });
    await expect(person.mutation(api.respond.submitResponse, submission(shareId, "completed-second"))).rejects.toThrow(/ALREADY_RESPONDED/);
    await expect(person.mutation(api.respond.submitResponse, submission(shareId, "partial-0"))).rejects.toThrow(/ALREADY_RESPONDED/);
    expect(await person.mutation(api.respond.submitResponse, submission(shareId, "completed-first"))).toMatchObject({ responseId: first.responseId, duplicate: true });
    expect(await owner.query(api.forms.getFormForEditor, { formId })).toMatchObject({ responseCount: 1, partialCount: 5 });
  });

  it("completes an existing partial once when two final requests arrive together", async () => {
    const t = testConvex();
    const { owner, formId, shareId } = await publish(t);
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, access: "signed_in", onePerPerson: true, collectPartial: true } });
    const person = t.withIdentity(otherCreatorIdentity);
    for (let i = 0; i < 5; i++) await person.mutation(api.respond.submitResponse, submission(shareId, `partial-${i}`, {}, false));
    const results = await Promise.allSettled([
      person.mutation(api.respond.submitResponse, submission(shareId, "partial-0")),
      person.mutation(api.respond.submitResponse, submission(shareId, "completed-other")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.objectContaining({ message: expect.stringContaining("ALREADY_RESPONDED") }) });
    expect(await owner.query(api.forms.getFormForEditor, { formId })).toMatchObject({ responseCount: 1, partialCount: 4 });
  });
});

describe("upload claims and response deletion", () => {
  it("returns all 55 current files and drains every upload and history record after deletion", async () => {
    const t = testConvex();
    const { owner, formId, shareId } = await publish(t, definition(11));
    const storageIds: Id<"_storage">[] = [];
    const answers: Answers = {};
    for (let i = 0; i < 55; i++) {
      const storageId = await blob(t);
      storageIds.push(storageId);
      const fieldId = `file${Math.floor(i / 5)}`;
      const { uploadId } = await register(t, shareId, storageId, fieldId);
      const existing = answers[fieldId];
      if (Array.isArray(existing)) existing.push(uploadId);
      else answers[fieldId] = [uploadId];
    }
    const { responseId } = await t.mutation(api.respond.submitResponse, submission(shareId, "files-response", answers));
    const detail = (await owner.query(api.formResults.getResponse, { responseId }))!;
    expect(detail.items.flatMap((item) => item.files)).toHaveLength(55);
    await t.run(async (ctx) => {
      for (let revision = 1; revision <= 9; revision++) await ctx.db.insert("formResponseRevisions", { formId, responseId, revision, answers, language: "en", savedAt: 0, replacedAt: 1 });
    });
    expect(await owner.mutation(api.formResults.deleteResponses, { formId, responseIds: [responseId, responseId] })).toBe(1);
    expect(await owner.query(api.formResults.getResponse, { responseId })).toBeNull();
    expect(await owner.query(api.forms.getFormForEditor, { formId })).toMatchObject({ responseCount: 0 });
    await finish(t);
    await t.mutation(internal.formResults.cleanupResponseArtifacts, { responseId });
    expect(await owner.mutation(api.formResults.deleteResponses, { formId, responseIds: [responseId] })).toBe(0);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("formUploads").collect()).toHaveLength(0);
      expect(await ctx.db.query("formResponseRevisions").collect()).toHaveLength(0);
      for (const id of storageIds) expect(await ctx.db.system.get(id)).toBeNull();
    });
  });

  it("uses single-use, expiring upload tickets scoped to a file question", async () => {
    const t = testConvex();
    const { shareId } = await publish(t);
    await expect(t.mutation(api.respond.generateUploadUrl, { shareId, fieldId: "text" })).rejects.toThrow(/INVALID_FIELD/);
    expect(await t.mutation(api.respond.generateUploadUrl, { shareId, fieldId: "file0" })).toMatch(/\/forms\/upload\?ticket=[0-9a-f]{48}$/);
    const token = await ticket(t, shareId);
    expect(await t.query(internal.respond.checkUploadTicket, { token, now: Date.now() })).toBe(true);
    expect(await t.query(internal.respond.checkUploadTicket, { token: "f".repeat(48), now: Date.now() })).toBe(false);
    expect(await t.query(internal.respond.checkUploadTicket, { token: "not-a-ticket", now: Date.now() })).toBe(false);
    const record = (storageId: Id<"_storage">) => t.mutation(internal.respond.recordUpload, { token, storageId, name: "a/b\u0000.txt", contentType: "text/plain", size: 4 });
    const first = await record(await blob(t));
    expect(first.name).toBe("a_b_.txt");
    await expect(record(await blob(t))).rejects.toThrow(/UPLOAD_TICKET_INVALID/);
    const late = await ticket(t, shareId);
    const issuedAt = Date.now();
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(await t.query(internal.respond.checkUploadTicket, { token: late, now: issuedAt })).toBe(true);
    expect(await t.query(internal.respond.checkUploadTicket, { token: late, now: Date.now() })).toBe(false);
    await t.mutation(internal.crons.cleanup, {});
    await t.run(async (ctx) => {
      expect(await ctx.db.query("formUploadTickets").collect()).toHaveLength(0);
      expect(await ctx.db.query("formUploads").collect()).toHaveLength(1);
    });
  });

  it("preserves an attached legacy alias and drains aged orphans past recent uploads", async () => {
    const t = testConvex();
    const { formId, shareId } = await publish(t);
    const sharedBlob = await blob(t);
    const claim = await register(t, shareId, sharedBlob);
    const { responseId } = await t.mutation(api.respond.submitResponse, submission(shareId, "legacy-response", { file0: [claim.uploadId] }));
    await t.run(async (ctx) => {
      const original = (await ctx.db.get("formUploads", claim.uploadId))!;
      const { _id: _id, _creationTime: _time, responseId: _response, ...alias } = original;
      await ctx.db.insert("formUploads", { ...alias, uploadKey: "legacy-orphan", createdAt: Date.now() - 2 * DAY });
      for (let i = 0; i < 30; i++) {
        const id = await ctx.storage.store(new Blob(["orphan"], { type: "text/plain" }));
        await ctx.db.insert("formUploads", { formId, storageId: id, uploadKey: `old-${i}`, fieldId: "file0", name: "old.txt", contentType: "text/plain", size: 6, createdAt: Date.now() - 2 * DAY });
      }
    });
    const freshBlob = await blob(t);
    await register(t, shareId, freshBlob);
    await t.mutation(internal.crons.cleanup, {});
    await finish(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("formUploads").collect()).toHaveLength(2);
      expect(await ctx.db.system.get(sharedBlob)).not.toBeNull();
      expect(await ctx.db.system.get(freshBlob)).not.toBeNull();
      expect(await ctx.db.get("formResponses", responseId)).not.toBeNull();
    });
  });

  it("preserves another form's legacy attachment when purging a form", async () => {
    const t = testConvex();
    const a = await publish(t);
    const b = await publish(t);
    const storageId = await blob(t);
    const claim = await register(t, b.shareId, storageId);
    const { responseId } = await t.mutation(api.respond.submitResponse, submission(b.shareId, "kept-response", { file0: [claim.uploadId] }));
    await t.run(async (ctx) => {
      const { _id: _id, _creationTime: _time, responseId: _response, ...alias } = (await ctx.db.get("formUploads", claim.uploadId))!;
      await ctx.db.insert("formUploads", { ...alias, formId: a.formId, uploadKey: "old-cross-form" });
    });
    await a.owner.mutation(api.forms.setFormStatus, { formId: a.formId, status: "archived" });
    await a.owner.mutation(api.forms.deleteForm, { formId: a.formId });
    await finish(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.system.get(storageId)).not.toBeNull();
      expect(await ctx.db.get("formResponses", responseId)).not.toBeNull();
      expect(await ctx.db.query("formUploads").collect()).toHaveLength(1);
    });
  });

  it("keeps scheduled bulk deletions scoped and decrements partial/spam counters once", async () => {
    const t = testConvex();
    const a = await publish(t);
    const b = await publish(t);
    await a.owner.mutation(api.forms.updateFormSettings, { formId: a.formId, settings: { ...defaultFormSettings, collectPartial: true } });
    const partial = await t.mutation(api.respond.submitResponse, submission(a.shareId, "partial-delete", {}, false));
    const spam = await t.mutation(api.respond.submitResponse, { ...submission(a.shareId, "spam-delete"), honeypot: "bot" });
    const other = await t.mutation(api.respond.submitResponse, submission(b.shareId, "foreign-kept"));
    await a.owner.mutation(api.formResults.deleteResponses, { formId: a.formId, responseIds: [partial.responseId, spam.responseId, other.responseId] });
    await finish(t);
    await t.mutation(internal.formResults.deleteResponseBatch, { formId: a.formId, responseIds: [partial.responseId, spam.responseId, other.responseId] });
    await finish(t);
    expect(await a.owner.query(api.forms.getFormForEditor, { formId: a.formId })).toMatchObject({ partialCount: 0, responseCount: 0 });
    expect(await b.owner.query(api.forms.getFormForEditor, { formId: b.formId })).toMatchObject({ responseCount: 1 });
    expect(await b.owner.query(api.formResults.getResponse, { responseId: other.responseId })).not.toBeNull();
  });
});

describe("resume expiry", () => {
  it("refuses expired answers even when cleanup has not run", async () => {
    const t = testConvex();
    const { formId, shareId } = await publish(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("formResumeDrafts", { formId, tokenHash: await sha256Hex(token), version: 1, answers: { text: "private" }, language: "en", updatedAt: 0, expiresAt: Date.now() - 1 });
    });
    expect(await t.query(api.respond.getResumeDraft, { shareId, token })).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("formResumeDrafts").collect())).toHaveLength(1);
  });

  it("invalidates created links at expiry and does not erase a refreshed draft early", async () => {
    const t = testConvex();
    const { owner, formId, shareId } = await publish(t);
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, allowResumeLink: true } });
    const first = await t.mutation(api.respond.saveResumeDraft, { shareId, token, answers: { text: "first" }, language: "en" });
    vi.setSystemTime(Date.now() + DAY);
    const refreshed = await t.mutation(api.respond.saveResumeDraft, { shareId, token, answers: { text: "refreshed" }, language: "en" });
    const draftId = (await t.run((ctx) => ctx.db.query("formResumeDrafts").first()))!._id;
    vi.setSystemTime(first.expiresAt);
    await t.mutation(internal.respond.expireResumeDraft, { draftId });
    expect(await t.query(api.respond.getResumeDraft, { shareId, token })).toMatchObject({ answers: { text: "refreshed" } });
    vi.setSystemTime(refreshed.expiresAt);
    await finish(t);
    expect(await t.query(api.respond.getResumeDraft, { shareId, token })).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("formResumeDrafts").collect())).toHaveLength(0);
  });
});

async function seedLargeResponses(t: Test, count = 100) {
  const def = emptyDefinition("Large responses");
  def.fields = Array.from({ length: 30 }, (_, i) => ({ id: `text${i}`, type: "textarea" as const, label: `Text ${i}`, required: false }));
  const { owner, formId, shareId } = await publish(t, def);
  const answers = Object.fromEntries(def.fields.map((field) => [field.id, "x".repeat(10_000)]));
  const first = await t.mutation(api.respond.submitResponse, submission(shareId, "large-first", answers));
  const { _id: _id, _creationTime: _time, ...source } = (await t.run((ctx) => ctx.db.get("formResponses", first.responseId)))!;
  const ids = [first.responseId];
  for (let offset = 1; offset < count; offset += 10) {
    await t.run(async (ctx) => {
      for (let i = offset; i < Math.min(count, offset + 10); i++) ids.push(await ctx.db.insert("formResponses", { ...source, submissionKey: `large-${i}`, receiptCode: `large-${i}` }));
    });
  }
  await t.run(async (ctx) => {
    // The first submission created the form's counter row (convex/formCounts.ts).
    const counter = (await ctx.db.query("formCounters").withIndex("by_formId", (q) => q.eq("formId", formId)).unique())!;
    await ctx.db.patch("formCounters", counter._id, { responseCount: count });
    const agg = (await ctx.db.query("formAggregates").withIndex("by_formId", (q) => q.eq("formId", formId)).unique())!;
    await ctx.db.patch("formAggregates", agg._id, { counts: Object.fromEntries(def.fields.map((f) => [f.id, { answered: count }])), totalDurationMs: count * 60_000, timedCount: count });
  });
  return { owner, formId, shareId, ids, answers };
}

describe("cleanup under production byte limits", () => {
  it("deletes 100 large responses and substantial history across bounded transactions", async () => {
    const t = testConvex();
    const { owner, formId, ids, answers } = await seedLargeResponses(t);
    for (let offset = 0; offset < 20; offset += 5) await t.run(async (ctx) => {
      for (let i = offset; i < offset + 5; i++) await ctx.db.insert("formResponseRevisions", { formId, responseId: ids[0], revision: i + 1, answers, language: "en", savedAt: 0, replacedAt: 1 });
    });
    expect(await owner.mutation(api.formResults.deleteResponses, { formId, responseIds: ids })).toBe(100);
    await finish(t);
    expect(await owner.query(api.forms.getFormForEditor, { formId })).toMatchObject({ responseCount: 0 });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("formResponses").first()).toBeNull();
      expect(await ctx.db.query("formResponseRevisions").first()).toBeNull();
      expect((await ctx.db.query("formAggregates").withIndex("by_formId", (q) => q.eq("formId", formId)).unique())!.counts.text0.answered).toBe(0);
    });
  });

  it("retains new responses while draining 100 large expired responses", async () => {
    const t = testConvex();
    const { owner, formId, shareId, ids } = await seedLargeResponses(t);
    for (const id of ids) await t.run((ctx) => ctx.db.patch("formResponses", id, { submittedAt: Date.now() - 3 * DAY }));
    const fresh = await t.mutation(api.respond.submitResponse, submission(shareId, "fresh-response", { text0: "Keep this" }));
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...defaultFormSettings, retentionDays: 1 } });
    await t.mutation(internal.crons.applyRetention, { cursor: null });
    await finish(t);
    expect(await owner.query(api.forms.getFormForEditor, { formId })).toMatchObject({ responseCount: 1 });
    expect(await t.run((ctx) => ctx.db.query("formResponses").collect())).toMatchObject([{ _id: fresh.responseId, answers: { text0: "Keep this" } }]);
  });

  it("purges large response and revision rows in bounded table phases", async () => {
    const t = testConvex();
    const { owner, formId, ids, answers } = await seedLargeResponses(t);
    for (let offset = 0; offset < 60; offset += 5) await t.run(async (ctx) => {
      for (let i = offset; i < offset + 5; i++) await ctx.db.insert("formResponseRevisions", { formId, responseId: ids[0], revision: i + 1, answers, language: "en", savedAt: 0, replacedAt: 1 });
    });
    const detail = (await owner.query(api.formResults.getResponse, { responseId: ids[0] }))!;
    expect(detail.revisionsTruncated).toBe(true);
    expect(detail.revisions.length).toBeGreaterThan(0);
    expect(detail.revisions.length).toBeLessThan(50);
    await owner.mutation(api.forms.setFormStatus, { formId, status: "archived" });
    await owner.mutation(api.forms.deleteForm, { formId });
    await finish(t);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("formResponses").first()).toBeNull();
      expect(await ctx.db.query("formResponseRevisions").first()).toBeNull();
      expect(await ctx.db.query("formVersions").first()).toBeNull();
    });
  });

  it("does not delete unrelated unregistered native storage during cleanup", async () => {
    const t = testConvex();
    const storageId = await blob(t, "legacy unregistered data");
    vi.setSystemTime(Date.now() + 2 * DAY);
    await t.mutation(internal.crons.cleanup, {});
    await finish(t);
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).not.toBeNull();
  });
});

describe("response counts", () => {
  it("keeps counts off the form document and carries over counts stored on it before", async () => {
    const t = testConvex();
    const { owner, formId, shareId } = await publish(t);
    // A form counted before formCounters existed: its counts are on the form and there is no counter row.
    await t.run((ctx) => ctx.db.patch("forms", formId, { responseCount: 7, partialCount: 2, lastResponseAt: 1 }));
    expect(await owner.query(api.forms.getFormForEditor, { formId })).toMatchObject({ responseCount: 7, partialCount: 2 });
    const before = (await t.run((ctx) => ctx.db.get("forms", formId)))!;
    await t.mutation(api.respond.submitResponse, submission(shareId, "count-one"));
    expect(await owner.query(api.forms.getFormForEditor, { formId })).toMatchObject({ responseCount: 8, partialCount: 2 });
    const after = (await t.run((ctx) => ctx.db.get("forms", formId)))!;
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.responseCount).toBe(7);
    const library = await owner.query(api.forms.listMyForms, {});
    expect(library.owned.find((form) => form._id === formId)).toMatchObject({ responseCount: 8 });
  });
});

