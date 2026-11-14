import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireActiveUser } from "./authz";
import { authorizedAttempt } from "./examAnswers";
import {
  classifyIntegrityReturn, integrityKind, requireIntegrityPolicy,
  type IntegrityDecision, type IntegrityKind,
} from "./examIntegrityModel";

const MAX_EVENTS_PER_ATTEMPT = 200;
const MAX_EVENTS_PER_MINUTE = 20;
const RETENTION_MS = 7 * 24 * 60 * 60_000;

/**
 * Server-authorized, coarse browser events. Do not accept client timestamps,
 * URLs, keystrokes, clipboard contents, device IDs, screenshots or free text.
 * All decisions are advisory; neither grading nor submission is changed.
 */
export const record = mutation({
  args: {
    attemptId: v.id("examAttempts"),
    eventId: v.string(),
    kind: integrityKind,
  },
  handler: async (ctx, { attemptId, eventId, kind }) => {
    const { attempt } = await authorizedAttempt(ctx, attemptId);
    const policy = requireIntegrityPolicy(attempt.integrityPolicy);
    if (policy.mode === "off")
      throw new Error("INTEGRITY_DISABLED: Browser monitoring is not enabled.");
    if (!/^[A-Za-z0-9:_-]{8,80}$/.test(eventId))
      throw new Error("INVALID_EVENT: Invalid idempotency identifier.");

    const previous = await ctx.db.query("examIntegrityEvents")
      .withIndex("by_attempt_event", q => q.eq("attemptId", attemptId).eq("eventId", eventId))
      .unique();
    if (previous) {
      if (previous.kind !== kind) throw new Error("IDEMPOTENCY_CONFLICT: Event kind changed.");
      return { eventId, observedAt: previous.observedAt,
        decision: previous.decision, gapMs: previous.gapMs ?? null };
    }

    const now = Date.now();
    const events = await ctx.db.query("examIntegrityEvents")
      .withIndex("by_attempt_time", q => q.eq("attemptId", attemptId))
      .order("desc").take(MAX_EVENTS_PER_ATTEMPT);
    if (events.length >= MAX_EVENTS_PER_ATTEMPT)
      throw new Error("EVENT_LIMIT: Attempt integrity event quota exhausted.");
    if (events.filter(e => e.observedAt > now - 60_000).length >= MAX_EVENTS_PER_MINUTE)
      throw new Error("RATE_LIMITED: Too many browser events.");

    // Only one away interval: hide+blur is ONE interruption, not two strikes.
    const signals = { ...attempt.integritySignals };
    let startField: "awayAt" | "offlineAt" | "fullscreenAt" | null = null;
    let endField: "awayAt" | "offlineAt" | "fullscreenAt" | null = null;
    if (kind === "hidden" || kind === "blur") startField = "awayAt";
    if (kind === "offline") startField = "offlineAt";
    if (kind === "fullscreen_exit") startField = "fullscreenAt";
    if (kind === "visible" || kind === "focus") endField = "awayAt";
    if (kind === "online") endField = "offlineAt";
    if (kind === "fullscreen_enter") endField = "fullscreenAt";
    if (startField && signals[startField] === undefined) signals[startField] = now;
    let gapMs: number | undefined;
    if (endField && signals[endField] !== undefined) {
      gapMs = Math.max(0, now - signals[endField]!);
      delete signals[endField];
    }
    let decision: IntegrityDecision = "observed";
    if (endField) {
      const warnings = events.filter(e =>
        e.decision === "warning" || e.decision === "review_required").length;
      decision = classifyIntegrityReturn(policy, kind as IntegrityKind, gapMs, warnings);
    }
    if (startField || endField)
      await ctx.db.patch("examAttempts", attemptId, { integritySignals: signals });

    const expiresAt = now + RETENTION_MS;
    const rowId = await ctx.db.insert("examIntegrityEvents", {
      attemptId, eventId, kind, observedAt: now, decision,
      ...(gapMs !== undefined ? { gapMs } : {}), expiresAt,
    });
    // Individual bounded retention; a failed purge can be retried by an admin
    // cleanup process. The retention boundary is also enforced on user reads.
    await ctx.scheduler.runAt(expiresAt, internal.examIntegrity.purgeExpired, {
      rowId, expiresAt,
    });
    return { eventId, observedAt: now, decision, gapMs: gapMs ?? null };
  },
});

/** Candidate-private transparency; not a teacher verdict or analytics feed. */
export const getMine = query({
  args: { attemptId: v.id("examAttempts") },
  handler: async (ctx, { attemptId }) => {
    const { identity, user } = await requireActiveUser(ctx);
    if (!user) throw new Error("ACCOUNT_REQUIRED: Complete account setup first.");
    const attempt = await ctx.db.get("examAttempts", attemptId);
    if (!attempt || attempt.studentId !== identity.subject)
      throw new Error("NOT_FOUND: Attempt not found.");
    const rows = await ctx.db.query("examIntegrityEvents")
      .withIndex("by_attempt_time", q => q.eq("attemptId", attemptId))
      .order("desc").take(MAX_EVENTS_PER_ATTEMPT);
    const now = Date.now();
    return rows.filter(row => row.expiresAt > now).map(row => ({
      eventId: row.eventId, kind: row.kind, observedAt: row.observedAt,
      decision: row.decision, gapMs: row.gapMs ?? null,
    }));
  },
});

/** Runs without a browser open; no student or teacher client can call this. */
export const purgeExpired = internalMutation({
  args: { rowId: v.id("examIntegrityEvents"), expiresAt: v.number() },
  handler: async (ctx, { rowId, expiresAt }) => {
    const row = await ctx.db.get("examIntegrityEvents", rowId);
    if (!row || row.expiresAt !== expiresAt || Date.now() < expiresAt) return false;
    await ctx.db.delete("examIntegrityEvents", rowId);
    return true;
  },
});
