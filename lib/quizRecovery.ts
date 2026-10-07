/** Device backup. The session id is the existing private attempt capability. */
export interface QuizBackup {
  version: 1;
  quizId: string;
  sessionId: string;
  playerName: string;
  questionIds: string[];
  currentQ: number;
  selected: Record<string, string>;
  multi: Record<string, string[]>;
  written: Record<string, string>;
  opened: Record<string, number>;
  pending: { qId: string; answer: string; isTimeout: boolean } | null;
}
const key = (quizId: string) => `chaos-quiz-backup:${quizId}`;
export function readQuizBackup(quizId: string): QuizBackup | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(quizId)) ?? "null");
    if (
      !value ||
      value.version !== 1 ||
      value.quizId !== quizId ||
      typeof value.sessionId !== "string" ||
      typeof value.playerName !== "string" ||
      !Array.isArray(value.questionIds) ||
      value.questionIds.length > 200 || new Set(value.questionIds).size !== value.questionIds.length ||
      !value.questionIds.every((id: unknown) => typeof id === "string") ||
      !Number.isInteger(value.currentQ) ||
      value.currentQ < 0 ||
      value.currentQ > value.questionIds.length
    )
      return null;
    for (const field of ["selected", "written", "multi", "opened"]) {
      const map = value[field];
      if (!map || typeof map !== "object" || Array.isArray(map)) return null;
      if (
        !Object.values(map).every((item) =>
          field === "multi"
            ? Array.isArray(item) && item.every((v) => typeof v === "string")
            : field === "opened"
              ? typeof item === "number" && Number.isFinite(item)
              : typeof item === "string",
        )
      )
        return null;
    }
    if (
      value.pending &&
      (typeof value.pending.qId !== "string" ||
        typeof value.pending.answer !== "string" ||
        typeof value.pending.isTimeout !== "boolean")
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function writeQuizBackup(backup: QuizBackup): boolean {
  try {
    localStorage.setItem(key(backup.quizId), JSON.stringify(backup));
    return true;
  } catch {
    return false;
  }
}
export function clearQuizBackup(quizId: string) {
  try {
    localStorage.removeItem(key(quizId));
  } catch {
    /* Storage may be disabled. */
  }
}
