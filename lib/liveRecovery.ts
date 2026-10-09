export interface LiveAnswerBackup {
  token: string;
  questionIndex: number;
  optionIds: string[];
}
const key = (gameId: string, questionIndex: number) =>
  `chaos-live-answer:${gameId}:${questionIndex}`;
export function readLiveAnswer(
  gameId: string,
  token: string,
  questionIndex: number,
): LiveAnswerBackup | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(key(gameId, questionIndex)) ?? "null",
    );
    return value &&
      value.token === token &&
      value.questionIndex === questionIndex &&
      Array.isArray(value.optionIds) &&
      value.optionIds.length <= 10 &&
      value.optionIds.every((id: unknown) => typeof id === "string")
      ? value
      : null;
  } catch {
    return null;
  }
}
export function saveLiveAnswer(
  gameId: string,
  value: LiveAnswerBackup,
): boolean {
  try {
    localStorage.setItem(
      key(gameId, value.questionIndex),
      JSON.stringify(value),
    );
    return true;
  } catch {
    return false;
  }
}
export function clearLiveAnswer(gameId: string, questionIndex: number) {
  try {
    localStorage.removeItem(key(gameId, questionIndex));
  } catch {
    /* private browsing */
  }
}
