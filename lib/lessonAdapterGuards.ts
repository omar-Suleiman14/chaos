import type { LessonAdapterProblem } from "./lessonBlockAdapter";

export function problem(
  path: string,
  message: string,
  code: LessonAdapterProblem["code"] = "invalid",
): LessonAdapterProblem {
  return { code, path, message };
}
export function bounded(value: unknown): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length <= 300_000;
  } catch {
    return false;
  }
}
