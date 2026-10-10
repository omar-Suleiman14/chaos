import { studyValue } from "./studyLessonValue";
export function fail(message: string): never {
  throw new Error(`VALIDATION_FAILED: ${message}`);
}
export const bounded = (value: unknown, max: number) => {
  if (new TextEncoder().encode(studyValue(value)).length > max)
    fail("Input exceeds workflow limits; split into smaller checkpoints.");
};
