/**
 * Webhook event emission. Called from the mutations where the state change
 * happens. Emission only writes delivery rows and schedules the delivery action,
 * so a slow or failing endpoint can never block or fail the calling mutation.
 */
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { answerText, isAnswerable } from "./formLogic";
import type { Answers, FormDefinition } from "./formLogic";
import {
  ANSWER_PAYLOAD_RETENTION_MS, PAYLOAD_RETENTION_MS, WEBHOOK_SCHEMA_VERSION,
} from "./webhookModel";
import type { WebhookEventType, WebhookSentEvent } from "./webhookModel";
import { randomHex } from "./serverUtils";
import { parseMultiAnswer } from "./grading";

type Subscription = Doc<"webhookSubscriptions">;

/** The data part of a payload, built once without and once with respondent answers. */
export type EventData = { base: Record<string, unknown>; withAnswers?: Record<string, unknown> };

export function buildBody(eventId: string, type: WebhookSentEvent, createdAt: number, data: Record<string, unknown>): string {
  return JSON.stringify({ id: eventId, type, version: WEBHOOK_SCHEMA_VERSION, createdAt, data });
}

/** Whether an API-created subscription's connection can still reach `itemRef`. */
async function connectionReaches(ctx: MutationCtx, sub: Subscription, itemRef: string): Promise<boolean> {
  if (!sub.connectionId) return false;
  const token = await ctx.db.get("integrationTokens", sub.connectionId);
  if (!token || token.revokedAt || (token.expiresAt !== undefined && token.expiresAt < Date.now())) return false;
  // Deliveries are part of what webhooks:manage grants; removing the permission stops them.
  if (!token.scopes.includes("webhooks:manage")) return false;
  const owner = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", token.ownerId)).first();
  if (owner?.isBanned || owner?.suspendedUntil) return false;
  if (token.access === "all" || token.itemRefs.includes(itemRef)) return true;
  const created = await ctx.db
    .query("integrationCreatedItems")
    .withIndex("by_tokenId_and_itemRef", (q) => q.eq("tokenId", token._id).eq("itemRef", itemRef))
    .first();
  return created !== null;
}

async function matches(ctx: MutationCtx, sub: Subscription, type: WebhookEventType, itemRef: string): Promise<boolean> {
  if (sub.status !== "active" || !sub.events.includes(type)) return false;
  if (sub.target === "all") return true;
  if (sub.target === "selected") return sub.itemRefs.includes(itemRef);
  return await connectionReaches(ctx, sub, itemRef);
}

/** Inserts a delivery row and schedules its first attempt. */
export async function enqueueDelivery(
  ctx: MutationCtx,
  sub: Subscription,
  args: { event: WebhookSentEvent; eventId: string; itemRef?: string; body: string; containsAnswers: boolean },
): Promise<Id<"webhookDeliveries">> {
  const now = Date.now();
  const deliveryId = await ctx.db.insert("webhookDeliveries", {
    subscriptionId: sub._id,
    ownerId: sub.ownerId,
    event: args.event,
    eventId: args.eventId,
    itemRef: args.itemRef,
    payload: args.body,
    containsAnswers: args.containsAnswers,
    payloadExpiresAt: now + (args.containsAnswers ? ANSWER_PAYLOAD_RETENTION_MS : PAYLOAD_RETENTION_MS),
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.webhookDelivery.deliver, { deliveryId });
  return deliveryId;
}

/**
 * Emits one event to every matching subscription of `ownerId`. Never throws:
 * a webhook problem must not undo the product action that caused it.
 */
export async function emitWebhookEvent(
  ctx: MutationCtx,
  ownerId: string,
  type: WebhookEventType,
  itemRef: string,
  build: () => EventData,
): Promise<number> {
  try {
    const subs = await ctx.db.query("webhookSubscriptions").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(100);
    const targets: Subscription[] = [];
    for (const sub of subs) if (await matches(ctx, sub, type, itemRef)) targets.push(sub);
    if (!targets.length) return 0;
    const data = build();
    const eventId = `evt_${randomHex(12)}`;
    const createdAt = Date.now();
    const plain = buildBody(eventId, type, createdAt, data.base);
    const rich = data.withAnswers ? buildBody(eventId, type, createdAt, data.withAnswers) : plain;
    for (const sub of targets) {
      // Connection-created subscriptions never receive answers, whatever the flag says.
      const withAnswers = sub.includeAnswers && !sub.connectionId && data.withAnswers !== undefined;
      await enqueueDelivery(ctx, sub, { event: type, eventId, itemRef, body: withAnswers ? rich : plain, containsAnswers: withAnswers });
    }
    return targets.length;
  } catch (error) {
    console.error("webhook emission failed", type, itemRef, error);
    return 0;
  }
}

// ── Payload builders ────────────────────────────────────────────────────────

export function formItem(form: Doc<"forms">, status: string = form.status) {
  return {
    id: `form_${form._id}`, kind: "form" as const, title: form.title, status,
    version: form.publishedVersion ?? null,
    sharePath: form.publishedVersion !== undefined ? `/f/${form.shareId}` : null,
  };
}

export function quizItem(quiz: Doc<"quizzes">, status: "live" | "closed" | "draft") {
  return {
    id: `quiz_${quiz._id}`, kind: "quiz" as const, title: quiz.title, status,
    version: null,
    sharePath: `/${quiz.creatorUsername}/${quiz.slug}`,
  };
}

function formAnswers(def: FormDefinition, answers: Answers) {
  const out = [];
  for (const field of def.fields) {
    if (!isAnswerable(field)) continue;
    const value = answers[field.id];
    if (value === undefined) continue;
    // Uploaded files are reported as a count only; their storage links never leave Chaos.
    out.push({
      fieldId: field.id, label: field.label, type: field.type,
      value: field.type === "file" ? null : value,
      text: answerText(field, value),
    });
  }
  return out;
}

export function formResponseData(form: Doc<"forms">, response: Doc<"formResponses">, def: FormDefinition): EventData {
  const answered = Object.keys(response.answers).filter((id) => def.fields.some((f) => f.id === id && isAnswerable(f))).length;
  const base = {
    item: formItem(form),
    response: {
      id: `response_${response._id}`,
      status: "completed",
      formVersion: response.version,
      startedAt: response.startedAt,
      submittedAt: response.submittedAt,
      durationMs: response.durationMs ?? null,
      language: response.language,
      answeredCount: answered,
      score: response.quizScore ?? null,
      maxScore: response.quizMaxScore ?? null,
      endingId: response.endingId ?? null,
    },
  };
  return { base, withAnswers: { ...base, answers: formAnswers(def, response.answers as Answers) } };
}

type QuizQuestionLike = { _id: Id<"questions">; questionText: string; type: string; points: number };

export function quizAttemptData(
  quiz: Doc<"quizzes">,
  session: Doc<"quizSessions">,
  questions: QuizQuestionLike[],
  grading?: { questionId: Id<"questions">; points: number; previousPoints: number; gradedAt: number },
): EventData {
  const base: Record<string, unknown> = {
    item: quizItem(quiz, quiz.isPublished ? "live" : "closed"),
    response: {
      id: `attempt_${session._id}`,
      status: "completed",
      formVersion: null,
      startedAt: session.startedAt,
      submittedAt: session.completedAt ?? null,
      durationMs: session.completedAt ? session.completedAt - session.startedAt : null,
      language: null,
      answeredCount: session.answers.filter((a) => a.answer.trim()).length,
      score: session.score,
      maxScore: session.totalPoints,
      endingId: null,
    },
  };
  if (grading) base.grading = { fieldId: grading.questionId, points: grading.points, previousPoints: grading.previousPoints, gradedAt: grading.gradedAt };
  const byId = new Map(questions.map((q) => [q._id, q]));
  const answers = session.answers.map((a) => {
    const q = byId.get(a.questionId);
    const multi = q?.type === "multi_select" ? parseMultiAnswer(a.answer) : null;
    return { fieldId: a.questionId, label: q?.questionText ?? "", type: q?.type ?? "unknown", value: multi ?? a.answer, text: multi ? multi.join(", ") : a.answer, correct: a.isCorrect, points: a.pointsEarned };
  });
  return { base, withAnswers: { ...base, respondent: { name: session.playerName }, answers } };
}

/** form.closed / form.reopened for a form status change. */
export async function emitFormStatusChange(ctx: MutationCtx, form: Doc<"forms">, next: Doc<"forms">["status"]) {
  if (form.status === next) return;
  const type = form.status === "live" ? "form.closed" : next === "live" ? "form.reopened" : null;
  if (!type) return;
  await emitWebhookEvent(ctx, form.ownerId, type, `form_${form._id}`, () => ({ base: { item: formItem(form, next), previousStatus: form.status } }));
}

/** response.completed / response.graded for a classic quiz attempt. Loads what it needs so call sites stay one line. */
export async function emitQuizAttemptEvent(
  ctx: MutationCtx,
  sessionId: Id<"quizSessions">,
  type: "response.completed" | "response.graded",
  grading?: { questionId: Id<"questions">; points: number; previousPoints: number },
) {
  const session = await ctx.db.get("quizSessions", sessionId);
  const quiz = session ? await ctx.db.get("quizzes", session.quizId) : null;
  if (!session || !quiz || session.status !== "completed") return;
  const questions = session.questionSnapshot ?? quiz.publishedSnapshot?.questions ?? [];
  await emitWebhookEvent(ctx, quiz.creatorId, type, `quiz_${quiz._id}`, () =>
    quizAttemptData(quiz, session, questions, grading ? { ...grading, gradedAt: Date.now() } : undefined));
}

/** form.published / form.closed for a classic quiz. */
export async function emitQuizStatusEvent(ctx: MutationCtx, quizId: Id<"quizzes">, type: "form.published" | "form.closed") {
  const quiz = await ctx.db.get("quizzes", quizId);
  if (!quiz) return;
  await emitWebhookEvent(ctx, quiz.creatorId, type, `quiz_${quiz._id}`, () => ({ base: { item: quizItem(quiz, type === "form.published" ? "live" : "closed") } }));
}
