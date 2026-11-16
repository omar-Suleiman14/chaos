import { v } from "convex/values";

/**
 * Best-effort, browser-observable integrity telemetry only. A browser event
 * cannot establish cheating, and no punitive action is permitted here.
 */
export const integrityMode = v.union(
  v.literal("off"), v.literal("record"), v.literal("warn"), v.literal("review"),
);
export const integrityPolicy = v.object({
  mode: integrityMode,
  graceMs: v.number(),
  reviewThreshold: v.number(),
});
export type IntegrityPolicy = {
  mode: "off" | "record" | "warn" | "review";
  graceMs: number;
  reviewThreshold: number;
};

export const integrityKind = v.union(
  v.literal("hidden"), v.literal("visible"),
  v.literal("blur"), v.literal("focus"),
  v.literal("offline"), v.literal("online"),
  v.literal("fullscreen_exit"), v.literal("fullscreen_enter"),
  v.literal("pagehide"),
);
export type IntegrityKind =
  | "hidden" | "visible" | "blur" | "focus"
  | "offline" | "online" | "fullscreen_exit" | "fullscreen_enter"
  | "pagehide";
export type IntegrityDecision =
  | "observed" | "grace" | "connection" | "recorded" | "warning" | "review_required";

export const integrityDecision = v.union(
  v.literal("observed"), v.literal("grace"), v.literal("connection"),
  v.literal("recorded"), v.literal("warning"), v.literal("review_required"),
);

/** The future authorized attempt-start transaction must freeze this choice. */
export function makeIntegrityPolicy(
  mode: IntegrityPolicy["mode"] = "off",
  graceMs = 15_000,
  reviewThreshold = 3,
): IntegrityPolicy {
  const policy = { mode, graceMs, reviewThreshold };
  return requireIntegrityPolicy(policy);
}

export function requireIntegrityPolicy(policy: IntegrityPolicy | undefined): IntegrityPolicy {
  if (!policy || !["off", "record", "warn", "review"].includes(policy.mode) ||
      !Number.isSafeInteger(policy.graceMs) || policy.graceMs < 3_000 ||
      policy.graceMs > 120_000 ||
      !Number.isSafeInteger(policy.reviewThreshold) ||
      policy.reviewThreshold < 1 || policy.reviewThreshold > 10)
    throw new Error("INTEGRITY_POLICY_INVALID: Frozen policy is required.");
  return policy;
}

/**
 * Server-observed elapsed time, not a client-supplied clock or claimed motive.
 * Connectivity interruptions are never counted as strikes.
 */
export function classifyIntegrityReturn(
  policy: IntegrityPolicy,
  kind: IntegrityKind,
  gapMs: number | undefined,
  previousWarnings: number,
): IntegrityDecision {
  requireIntegrityPolicy(policy);
  if (gapMs === undefined) return "observed";
  if (kind === "online") return "connection";
  if (gapMs <= policy.graceMs) return "grace";
  if (policy.mode === "record") return "recorded";
  if (policy.mode === "warn") return "warning";
  if (policy.mode === "review")
    return previousWarnings + 1 >= policy.reviewThreshold ? "review_required" : "warning";
  return "observed";
}
