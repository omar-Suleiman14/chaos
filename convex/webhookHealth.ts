import type { Doc } from "./_generated/dataModel";
import { FAILING_AFTER } from "./webhookModel";

/** Public subscription state, independent from delivery/retry side effects. */
export function webhookHealth(sub: Pick<Doc<"webhookSubscriptions">, "status" | "consecutiveFailures" | "lastAttemptAt">):
  "paused" | "disabled" | "failing" | "healthy" | "new" {
  if (sub.status !== "active") return sub.status;
  if (sub.consecutiveFailures >= FAILING_AFTER) return "failing";
  return sub.lastAttemptAt === undefined ? "new" : "healthy";
}
