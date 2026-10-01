import { homeworkUploadAccess } from "./homeworkUploadAccess";
import { env } from "./_generated/server";
import { UPLOAD_PATH, uploadRejection } from "./respond";
import { randomHex, sha256Hex } from "./serverUtils";
import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { HOMEWORK_LIMITS } from "./homeworkModel";
import { gradeQuiz, publicQuizDefinition } from "./formQuiz";
import { definitionValidator, answersValidator, languageValidator } from "./formModel";
import { releasedDefinition, nextFieldReleaseAt, assertReleasedAnswers } from "./formRelease";
import { creatorRestricted } from "./authz";
import { checkAnswers, searchTextFor, selectEnding } from "./formLogic";
import { countResponse, responseCap } from "./respond";
import { consumeRate, randomCode } from "./serverUtils";
import { emitWebhookEvent, formResponseData } from "./webhookEvents";
type Ctx = MutationCtx | QueryCtx;
async function actor(ctx: Ctx) {
  const id = await ctx.auth.getUserIdentity();
  if (!id) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", id.subject))
    .first();
  if (user?.isBanned || user?.suspendedUntil)
    throw new Error("Account restricted");
  return id;
}
const assignmentArg = { assignmentId: v.id("homeworkAssignments") };
async function owned(
  ctx: Ctx,
  assignmentId: import("convex/values").GenericId<"homeworkAssignments">,
) {
  const identity = await actor(ctx);
  const assignment = await ctx.db.get("homeworkAssignments", assignmentId);
  if (!assignment || assignment.ownerId !== identity.tokenIdentifier)
    throw new Error("Assignment owner required");
  return assignment;
}
export const create = mutation({
  args: {
    formId: v.id("forms"),
    versionId: v.id("formVersions"),
    title: v.string(),
    opensAt: v.number(),
    deadline: v.number(),
    maxAttempts: v.number(),
  },
  returns: v.id("homeworkAssignments"),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const form = await ctx.db.get("forms", args.formId);
    const version = await ctx.db.get("formVersions", args.versionId);
    if (
      !form ||
      form.ownerId !== identity.subject ||
      !version ||
      version.formId !== form._id ||
      !version.definition.quiz?.enabled
    )
      throw new Error("Owned published quiz required");
    if (
      !args.title.trim() ||
      args.title.length > 200 ||
      !Number.isFinite(args.opensAt) ||
      !Number.isFinite(args.deadline) ||
      args.deadline <= Math.max(args.opensAt, Date.now()) ||
      !Number.isInteger(args.maxAttempts) ||
      args.maxAttempts < 1 ||
      args.maxAttempts > HOMEWORK_LIMITS.attempts
    )
      throw new Error("Invalid assignment limits or dates");
    return ctx.db.insert("homeworkAssignments", {
      ...args,
      ownerId: identity.tokenIdentifier,
      closed: false,
      enrollmentCount: 0,
      createdAt: Date.now(),
    });
  },
});
export const enroll = mutation({
  args: { ...assignmentArg, studentId: v.optional(v.string()), email: v.optional(v.string()), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const assignment = await owned(ctx, args.assignmentId);
    // Host selects a registered account by ID or email; authorization never derives from this argument.
    const email = args.email?.trim();
    const student = args.studentId
      ? await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", args.studentId!)).first()
      : email
        ? (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).first()) ?? (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email.toLowerCase())).first())
        : null;
    if (!student || student.isBanned || student.suspendedUntil)
      throw new Error("NOT_FOUND: No active Chaos account uses that email. Ask the student to sign in once first.");
    const studentId = student.clerkId;
    const existing = await ctx.db
      .query("homeworkEnrollments")
      .withIndex("by_assignmentId_and_studentId", (q) =>
        q.eq("assignmentId", assignment._id).eq("studentId", studentId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("homeworkEnrollments", existing._id, {
        active: args.active,
      });
      return null;
    }
    if (assignment.enrollmentCount >= HOMEWORK_LIMITS.enrollments)
      throw new Error("Enrollment limit reached");
    await ctx.db.insert("homeworkEnrollments", {
      assignmentId: assignment._id,
      studentId: studentId,
      active: args.active,
      enrolledAt: Date.now(),
      attempts: 0,
    });
    await ctx.db.patch("homeworkAssignments", assignment._id, {
      enrollmentCount: assignment.enrollmentCount + 1,
    });
    return null;
  },
});
export const setClosed = mutation({
  args: { ...assignmentArg, closed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await owned(ctx, args.assignmentId);
    await ctx.db.patch("homeworkAssignments", args.assignmentId, {
      closed: args.closed,
    });
    return null;
  },
});
export const startAttempt = mutation({
  args: assignmentArg,
  returns: v.id("homeworkAttempts"),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const assignment = await ctx.db.get(
      "homeworkAssignments",
      args.assignmentId,
    );
    const now = Date.now();
    if (
      !assignment ||
      assignment.closed ||
      now < assignment.opensAt ||
      now > assignment.deadline
    )
      throw new Error("Assignment not open");
    const enrollment = await ctx.db
      .query("homeworkEnrollments")
      .withIndex("by_assignmentId_and_studentId", (q) =>
        q.eq("assignmentId", assignment._id).eq("studentId", identity.subject),
      )
      .unique();
    if (!enrollment?.active || now < enrollment.enrolledAt)
      throw new Error("Active enrollment required");
    const form = await ctx.db.get("forms", assignment.formId);
    if (!form || form.status === "archived" || form.isBanned || await creatorRestricted(ctx, form.ownerId))
      throw new Error("Assignment content unavailable");
    const attempts = await ctx.db
      .query("homeworkAttempts")
      .withIndex("by_assignmentId_and_studentId", (q) =>
        q
          .eq("assignmentId", assignment._id)
          .eq("studentId", identity.tokenIdentifier),
      )
      .take(11);
    const pending = attempts.find((a) => !a.responseId);
    if (pending) return pending._id;
    if (enrollment.attempts >= assignment.maxAttempts)
      throw new Error("Attempt limit reached");
    await ctx.db.patch("homeworkEnrollments", enrollment._id, {
      attempts: enrollment.attempts + 1,
    });
    return ctx.db.insert("homeworkAttempts", {
      assignmentId: assignment._id,
      studentId: identity.tokenIdentifier,
      number: enrollment.attempts + 1,
      startedAt: now,
    });
  },
});
/** Delivery is tied to an owned pending attempt, never the form's latest version.
 * Enrollment authorizes private pinned content; normal public form access is not
 * broadened. Completed attempts cannot retrieve new assessment material.
 */
export const getAttemptDefinition = query({
  args: { attemptId: v.id("homeworkAttempts") },
  returns: v.object({ assignmentId: v.id("homeworkAssignments"), attemptId: v.id("homeworkAttempts"), title: v.string(), formId: v.id("forms"), versionId: v.id("formVersions"), version: v.number(), definition: definitionValidator, deadline: v.number(), attemptNumber: v.number(), attemptsRemaining: v.number(), serverTime: v.number(), nextFieldReleaseAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const attempt = await ctx.db.get("homeworkAttempts", args.attemptId);
    if (!attempt || attempt.studentId !== identity.tokenIdentifier) throw new Error("Own attempt required");
    const assignment = await ctx.db.get("homeworkAssignments", attempt.assignmentId);
    const now = Date.now();
    if (!assignment || assignment.closed || now < assignment.opensAt || now > assignment.deadline) throw new Error("Assignment not open");
    const enrollment = await ctx.db.query("homeworkEnrollments").withIndex("by_assignmentId_and_studentId", q => q.eq("assignmentId", assignment._id).eq("studentId", identity.subject)).unique();
    if (!enrollment?.active || now < enrollment.enrolledAt) throw new Error("Active enrollment required");
    if (attempt.responseId || attempt.number < 1 || attempt.number > assignment.maxAttempts || enrollment.attempts > assignment.maxAttempts) throw new Error("Attempt unavailable or limit reached");
    const form = await ctx.db.get("forms", assignment.formId);
    const version = await ctx.db.get("formVersions", assignment.versionId);
    if (!form || form.status === "archived" || form.isBanned || await creatorRestricted(ctx, form.ownerId) || !version || version.formId !== form._id || !version.definition.quiz?.enabled) throw new Error("Assignment content unavailable");
    return { assignmentId: assignment._id, attemptId: attempt._id, title: assignment.title, formId: form._id, versionId: version._id, version: version.version, definition: publicQuizDefinition(releasedDefinition(version.definition, now)), deadline: assignment.deadline, attemptNumber: attempt.number, attemptsRemaining: Math.max(0, assignment.maxAttempts - enrollment.attempts), serverTime: now, nextFieldReleaseAt: nextFieldReleaseAt(version.definition, now) };
  },
});
export const generateUploadUrl = mutation({
 args: { attemptId: v.id("homeworkAttempts"), fieldId: v.string() }, returns: v.string(),
 handler: async (ctx, args) => {
 const now = Date.now();
 const { form, version, assignment } = await homeworkUploadAccess(ctx, args.attemptId, now);
 const field = releasedDefinition(version.definition, now).fields.find(f => f.id === args.fieldId && f.type === "file");
 if (!field) throw new Error("INVALID_FIELD: Released file question required");
 await consumeRate(ctx, `homework-upload:${args.attemptId}`, 60, 60000);
 const token = randomHex(24);
 await ctx.db.insert("formUploadTickets", { formId: form._id, fieldId: field.id, homeworkAttemptId: args.attemptId, uploadKey: randomHex(12), tokenHash: await sha256Hex(token), expiresAt: Math.min(now + 600000, assignment.deadline) });
 return `${env.CONVEX_SITE_URL}${UPLOAD_PATH}?ticket=${token}`;
 }});
/** Atomic pinned submission. The attempt ID is the server-owned idempotency key.
 * Retries return immutable evidence even after closure; they never regrade.
 * File answers require validated receipts owned by this attempt.
 */
export const submitAttempt = mutation({
  args: { attemptId: v.id("homeworkAttempts"), answers: answersValidator, language: languageValidator },
  returns: v.object({ responseId: v.id("formResponses"), score: v.number(), maxScore: v.number(), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const attempt = await ctx.db.get("homeworkAttempts", args.attemptId);
    if (!attempt || attempt.studentId !== identity.tokenIdentifier) throw new Error("Own attempt required");
    if (attempt.responseId) {
      if (attempt.score === undefined || attempt.maxScore === undefined) throw new Error("Attempt evidence unavailable");
      return { responseId: attempt.responseId, score: attempt.score, maxScore: attempt.maxScore, duplicate: true };
    }
    if (JSON.stringify(args.answers).length > 400000) throw new Error("PAYLOAD_TOO_LARGE");
    const now = Date.now();
    const assignment = await ctx.db.get("homeworkAssignments", attempt.assignmentId);
    if (!assignment || assignment.closed || now < assignment.opensAt || now > assignment.deadline) throw new Error("Assignment not open");
    const enrollment = await ctx.db.query("homeworkEnrollments").withIndex("by_assignmentId_and_studentId", q => q.eq("assignmentId", assignment._id).eq("studentId", identity.subject)).unique();
    if (!enrollment?.active || attempt.startedAt < enrollment.enrolledAt) throw new Error("Active enrollment required");
    if (attempt.number < 1 || attempt.number > assignment.maxAttempts || enrollment.attempts > assignment.maxAttempts) throw new Error("Attempt limit reached");
    const form = await ctx.db.get("forms", assignment.formId);
    const version = await ctx.db.get("formVersions", assignment.versionId);
    if (!form || form.status === "archived" || form.isBanned || await creatorRestricted(ctx, form.ownerId) || !version || version.formId !== form._id || !version.definition.quiz?.enabled) throw new Error("Assignment content unavailable");
    if (!version.definition.languages.includes(args.language)) throw new Error("Unsupported assignment language");
    const cap = await responseCap(ctx, form, now);
    if (cap !== null && form.responseCount >= cap) throw new Error("FORM_FULL: Response limit reached");
    await consumeRate(ctx, `homework-submit:${identity.tokenIdentifier}`, 60, 60000);
    assertReleasedAnswers(version.definition, args.answers, now);
    const definition = releasedDefinition(version.definition, now);
    const fileIds = new Set<string>();
    const uploads: import("./_generated/dataModel").Doc<"formUploads">[] = [];
    for (const field of definition.fields) {
      const value = args.answers[field.id];
      if (field.type !== "file" || !Array.isArray(value)) continue;
      if (value.length > Math.min(field.max ?? 1, 5) || new Set(value).size !== value.length) throw new Error("VALIDATION_FAILED: Invalid file count");
      for (const raw of value) {
        const id = ctx.db.normalizeId("formUploads", raw);
        const upload = id ? await ctx.db.get("formUploads", id) : null;
        if (!upload || upload.homeworkAttemptId !== attempt._id || upload.formId !== form._id || upload.fieldId !== field.id || upload.responseId) throw new Error("VALIDATION_FAILED: Own attempt file receipt required");
        const metadata = await ctx.db.system.get("_storage", upload.storageId);
        if (!metadata || metadata.size !== upload.size || (metadata.contentType !== undefined && metadata.contentType !== upload.contentType) || uploadRejection(upload.contentType, upload.size)) throw new Error("VALIDATION_FAILED: File unavailable or invalid");
        fileIds.add(raw); uploads.push(upload);
      }
    }
    const checked = checkAnswers(definition, args.answers, { fileIds });
    if (Object.keys(checked.errors).length) throw new Error("VALIDATION_FAILED: " + JSON.stringify(checked.errors));
    const grade = gradeQuiz(definition, checked.answers);
    if (!grade || !Number.isFinite(grade.score) || !Number.isFinite(grade.maxScore) || grade.maxScore <= 0) throw new Error("Valid graded quiz required");
    const ending = selectEnding(definition, checked.answers);
    const responseId = await ctx.db.insert("formResponses", { formId: form._id, version: version.version, status: "completed", answers: checked.answers, language: args.language, submissionKey: `homework-${attempt._id}`, respondentId: identity.subject, receiptCode: randomCode(8).toUpperCase(), startedAt: attempt.startedAt, submittedAt: now, updatedAt: now, durationMs: now - attempt.startedAt, ...(ending ? { endingId: ending.id } : {}), reviewed: false, tags: [], spam: false, searchText: searchTextFor(definition, checked.answers), quizScore: grade.score, quizMaxScore: grade.maxScore });
    for (const upload of uploads) if (Object.values(checked.answers).some(value => Array.isArray(value) && value.includes(upload._id))) await ctx.db.patch("formUploads", upload._id, { responseId });
    await ctx.db.patch("homeworkAttempts", attempt._id, { responseId, submittedAt: now, score: grade.score, maxScore: grade.maxScore });
    const response = (await ctx.db.get("formResponses", responseId))!;
    await countResponse(ctx, form, response, definition, 1);
    await emitWebhookEvent(ctx, form.ownerId, "response.completed", `form_${form._id}`, () => formResponseData(form, response, definition));
    return { responseId, score: grade.score, maxScore: grade.maxScore, duplicate: false };
  },
});
export const recordAttempt = mutation({
  args: {
    attemptId: v.id("homeworkAttempts"),
    responseId: v.id("formResponses"),
  },
  returns: v.id("homeworkAttempts"),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const attempt = await ctx.db.get("homeworkAttempts", args.attemptId);
    if (!attempt || attempt.studentId !== identity.tokenIdentifier)
      throw new Error("Own attempt required");
    if (attempt.responseId) {
      if (attempt.responseId !== args.responseId)
        throw new Error("Attempt already recorded");
      return attempt._id;
    }
    const assignment = await ctx.db.get(
      "homeworkAssignments",
      attempt.assignmentId,
    );
    const response = await ctx.db.get("formResponses", args.responseId);
    const version =
      assignment && (await ctx.db.get("formVersions", assignment.versionId));
    const enrollment = await ctx.db
      .query("homeworkEnrollments")
      .withIndex("by_assignmentId_and_studentId", (q) =>
        q
          .eq("assignmentId", attempt.assignmentId)
          .eq("studentId", identity.subject),
      )
      .unique();
    if (
      !assignment ||
      assignment.closed ||
      !enrollment?.active ||
      !version ||
      !response ||
      response.respondentId !== identity.subject ||
      response.status !== "completed" ||
      response.spam ||
      response.formId !== assignment.formId ||
      response.version !== version.version ||
      response.source === "live"
    )
      throw new Error("Eligible completed quiz response required");
    // Edited responses cannot supply original immutable homework evidence.
    if (
      response.editCount ||
      response.editedAt ||
      !Number.isFinite(response.startedAt) ||
      !Number.isFinite(response.submittedAt) ||
      response.startedAt <
        Math.max(
          attempt.startedAt,
          enrollment.enrolledAt,
          assignment.opensAt,
        ) ||
      response.submittedAt < response.startedAt ||
      response.submittedAt > assignment.deadline ||
      response.submittedAt > Date.now()
    )
      throw new Error("Response outside attempt window or edited");
    const duplicate = await ctx.db
      .query("homeworkAttempts")
      .withIndex("by_responseId", (q) => q.eq("responseId", args.responseId))
      .unique();
    if (duplicate) throw new Error("Response already associated with homework");
    const grade = gradeQuiz(version.definition, response.answers);
    if (
      !grade ||
      !Number.isFinite(grade.score) ||
      !Number.isFinite(grade.maxScore) ||
      grade.maxScore <= 0
    )
      throw new Error("Valid graded quiz required");
    await ctx.db.patch("homeworkAttempts", attempt._id, {
      responseId: response._id,
      submittedAt: response.submittedAt,
      score: grade.score,
      maxScore: grade.maxScore,
    });
    return attempt._id;
  },
});
const progress = v.object({
  number: v.number(),
  startedAt: v.number(),
  submittedAt: v.union(v.number(), v.null()),
  score: v.union(v.number(), v.null()),
  maxScore: v.union(v.number(), v.null()),
});
export const myProgress = query({
  args: assignmentArg,
  returns: v.array(progress),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const attempts = await ctx.db
      .query("homeworkAttempts")
      .withIndex("by_assignmentId_and_studentId", (q) =>
        q
          .eq("assignmentId", args.assignmentId)
          .eq("studentId", identity.tokenIdentifier),
      )
      .take(10);
    return attempts.map((a) => ({
      number: a.number,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt ?? null,
      score: a.score ?? null,
      maxScore: a.maxScore ?? null,
    }));
  },
});
export const report = query({
  args: { ...assignmentArg, studentId: v.string() },
  returns: v.array(progress),
  handler: async (ctx, args) => {
    await owned(ctx, args.assignmentId);
    const identity = await actor(ctx);
    const key = `${identity.issuer}|${args.studentId}`;
    const attempts = await ctx.db
      .query("homeworkAttempts")
      .withIndex("by_assignmentId_and_studentId", (q) =>
        q.eq("assignmentId", args.assignmentId).eq("studentId", key),
      )
      .take(10);
    return attempts.map((a) => ({
      number: a.number,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt ?? null,
      score: a.score ?? null,
      maxScore: a.maxScore ?? null,
    }));
  },
});

/** The caller's assignments for one form, newest first, so hosts never paste IDs. */
export const listForForm = query({
  args: { formId: v.id("forms") },
  returns: v.array(v.object({ id: v.id("homeworkAssignments"), title: v.string(), version: v.number(), opensAt: v.number(), deadline: v.number(), maxAttempts: v.number(), closed: v.boolean(), enrollmentCount: v.number(), createdAt: v.number() })),
  handler: async (ctx, args) => {
    const identity = await actor(ctx);
    const rows = await ctx.db.query("homeworkAssignments").withIndex("by_formId", (q) => q.eq("formId", args.formId)).order("desc").take(100);
    const out = [];
    for (const a of rows) {
      if (a.ownerId !== identity.tokenIdentifier) continue;
      const version = await ctx.db.get("formVersions", a.versionId);
      out.push({ id: a._id, title: a.title, version: version?.version ?? 0, opensAt: a.opensAt, deadline: a.deadline, maxAttempts: a.maxAttempts, closed: a.closed, enrollmentCount: a.enrollmentCount, createdAt: a.createdAt });
    }
    return out;
  },
});

/** Enrolled students with names and their best submitted attempt (owner only, at most 200). */
export const roster = query({
  args: assignmentArg,
  returns: v.array(v.object({ studentId: v.string(), name: v.string(), email: v.string(), active: v.boolean(), attempts: v.number(), submitted: v.number(), bestScore: v.union(v.number(), v.null()), maxScore: v.union(v.number(), v.null()), lastSubmittedAt: v.union(v.number(), v.null()) })),
  handler: async (ctx, args) => {
    await owned(ctx, args.assignmentId);
    const identity = await actor(ctx);
    const rows = await ctx.db.query("homeworkEnrollments").withIndex("by_assignmentId_and_studentId", (q) => q.eq("assignmentId", args.assignmentId)).take(200);
    const out = [];
    for (const e of rows) {
      const user = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", e.studentId)).first();
      const attempts = await ctx.db.query("homeworkAttempts").withIndex("by_assignmentId_and_studentId", (q) => q.eq("assignmentId", args.assignmentId).eq("studentId", `${identity.issuer}|${e.studentId}`)).take(10);
      const done = attempts.filter((a) => a.submittedAt !== undefined);
      const best = done.reduce<(typeof done)[number] | null>((b, a) => (a.score ?? -1) > (b?.score ?? -1) ? a : b, null);
      out.push({ studentId: e.studentId, name: user?.name ?? "", email: user?.email ?? "", active: e.active, attempts: attempts.length, submitted: done.length, bestScore: best?.score ?? null, maxScore: best?.maxScore ?? null, lastSubmittedAt: done.length ? Math.max(...done.map((a) => a.submittedAt!)) : null });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});
