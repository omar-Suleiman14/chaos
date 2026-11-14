import { v } from "convex/values";

/** Human findings are administrative review states, never cheating verdicts. */
export const caseDisposition = v.union(
  v.literal("needs_review"), v.literal("no_action"),
  v.literal("follow_up"), v.literal("policy_issue"),
);
export const accommodationKind = v.union(
  v.literal("extra_time"), v.literal("breaks_allowed"),
  v.literal("reduced_monitoring"),
);
export const interventionKind = v.union(
  v.literal("connectivity_acknowledged"), v.literal("candidate_contacted"),
);

export function boundedReviewText(value: string) {
  const text = value.trim();
  if (text.length < 10 || text.length > 500)
    throw new Error("INVALID_NOTE: Provide 10–500 characters without private medical details.");
  return text;
}

/** Rescheduling must be explicit, bounded, before expiry and within exam closure. */
export function extendedDeadline(
  attempt: { startedAt: number; deadlineAt?: number },
  now: number, minutes: number, closesAt?: number,
) {
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 120)
    throw new Error("INVALID_EXTENSION: Time extension must be 1–120 minutes.");
  if (!attempt.deadlineAt || now >= attempt.deadlineAt)
    throw new Error("ATTEMPT_TIMED_OUT: Expired attempts cannot be reopened.");
  const proposed = attempt.deadlineAt + minutes * 60_000;
  if (proposed > attempt.startedAt + 480 * 60_000 ||
      (closesAt !== undefined && proposed > closesAt))
    throw new Error("EXTENSION_LIMIT: Extension exceeds exam duration or closing time.");
  return proposed;
}
