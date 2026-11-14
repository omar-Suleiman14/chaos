import { v, type Infer } from "convex/values";
import type { ExamSettings } from "./examSettingsModel";

/** Frozen at submission; subsequent edits to the live release cannot unlock old marks. */
export const frozenResultPolicy = v.object({
  visibility: v.union(v.literal("immediate"), v.literal("after_close"), v.literal("manual")),
  closesAt: v.optional(v.number()),
  passingPercent: v.number(),
});
export type FrozenResultPolicy = Infer<typeof frozenResultPolicy>;
export type ResultStatus = "grading" | "withheld" | "released";

const fallback: FrozenResultPolicy = { visibility: "manual", passingPercent: 50 };

export function freezeResultPolicy(settings: ExamSettings | undefined): FrozenResultPolicy {
  if (!settings || !Number.isFinite(settings.passingPercent) ||
      settings.passingPercent < 0 || settings.passingPercent > 100)
    return { ...fallback };
  if (settings.resultVisibility === "after_close") {
    if (settings.mode !== "scheduled" || !Number.isSafeInteger(settings.closesAt) ||
        (settings.closesAt ?? 0) <= 0) return { ...fallback };
    return {
      visibility: "after_close", closesAt: settings.closesAt,
      passingPercent: settings.passingPercent,
    };
  }
  return {
    visibility: settings.resultVisibility === "immediate" ? "immediate" : "manual",
    passingPercent: settings.passingPercent,
  };
}

/** Missing policies are legacy/manual-only, never an implicit public release. */
export function resultStatus(
  grade: { state: "auto_final" | "needs_manual"; finalPercentBasisPoints?: number } | null,
  policy: FrozenResultPolicy | undefined,
  manuallyPublished: boolean,
  now: number,
): ResultStatus {
  if (!grade || grade.state !== "auto_final" ||
      !Number.isSafeInteger(grade.finalPercentBasisPoints) ||
      (grade.finalPercentBasisPoints ?? -1) < 0)
    return "grading";
  const rule = policy ?? fallback;
  if (rule.visibility === "immediate") return "released";
  if (rule.visibility === "after_close")
    return Number.isSafeInteger(rule.closesAt) && now >= rule.closesAt! ? "released" : "withheld";
  return manuallyPublished ? "released" : "withheld";
}
