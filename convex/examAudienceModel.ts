import { v, type Infer } from "convex/values";

/** An assignment never expands course admission: all modes require an approved enrollment. */
export const examAudience = v.object({
  mode: v.union(v.literal("all"), v.literal("students"), v.literal("groups")),
  studentIds: v.array(v.string()),
  groupIds: v.array(v.id("courseGroups")),
});
export type ExamAudience = Infer<typeof examAudience>;

export function validateExamAudience(a: ExamAudience): ExamAudience {
  const unique = <T extends string>(ids: T[], max: number) =>
    ids.length <= max && new Set(ids).size === ids.length;
  if (!unique(a.studentIds, 100) || !unique(a.groupIds, 100) ||
      a.studentIds.some(id => !id.trim() || id.length > 160))
    throw new Error("VALIDATION_FAILED: Select at most 100 unique students or groups.");
  if (a.mode === "all" && (a.studentIds.length || a.groupIds.length) ||
      a.mode === "students" && (!a.studentIds.length || a.groupIds.length) ||
      a.mode === "groups" && (!a.groupIds.length || a.studentIds.length))
    throw new Error("VALIDATION_FAILED: Select one approved course audience.");
  return { mode: a.mode, studentIds: [...a.studentIds], groupIds: [...a.groupIds] };
}
