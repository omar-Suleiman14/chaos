import type { Id } from "@/convex/_generated/dataModel";
import { publicationErrors } from "@/convex/quizModel";

export type QuestionType = "mcq" | "true_false" | "multi_select" | "written";
export const questionTypes: QuestionType[] = ["mcq", "true_false", "multi_select", "written"];

export interface QuestionDraft {
  clientKey: string;
  id?: Id<"questions">;
  type: QuestionType;
  questionText: string;
  options: string[];
  correctAnswer: string;
  correctAnswers: string[];
  keywords: string[];
  points: number;
  timeLimit: number;
  hint: string;
  explanation: string;
}

export interface QuizSettingsDraft {
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  showCorrectAnswers: boolean;
  showExplanations: boolean;
  passingThreshold: number;
  disableAnimations: boolean;
  /** 0 = every attempt answers every question. */
  poolSize: number;
  resultRelease: "immediate" | "manual";
}

export interface EditorDraft {
  title: string;
  description: string;
  slug: string;
  groupName: string;
  quizSettings: QuizSettingsDraft;
  questions: QuestionDraft[];
}

export function newClientKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function blankQuestion(type: QuestionType, timeLimit: number, points = 1): QuestionDraft {
  return {
    clientKey: newClientKey(),
    type,
    questionText: "",
    options: type === "true_false" ? ["True", "False"] : type === "written" ? [] : ["", "", "", ""],
    correctAnswer: "",
    correctAnswers: [],
    keywords: [],
    points,
    timeLimit,
    hint: "",
    explanation: "",
  };
}

/**
 * Switch a question's type without silently discarding authored content.
 * Answer keys that are meaningless for the new type are cleared, because the
 * server stores exactly what is sent.
 */
export function changeQuestionType(q: QuestionDraft, type: QuestionType): QuestionDraft {
  if (q.type === type) return q;
  const authoredOptions = q.type === "true_false" ? [] : q.options;
  const next: QuestionDraft = { ...q, type, correctAnswer: "", correctAnswers: [] };
  if (type === "true_false") next.options = ["True", "False"];
  else if (type === "written") next.options = authoredOptions;
  else next.options = authoredOptions.length >= 2 ? authoredOptions : ["", "", "", ""];
  if (type === "multi_select" && q.type === "mcq" && q.correctAnswer) next.correctAnswers = [q.correctAnswer];
  if (type === "mcq" && q.type === "multi_select" && q.correctAnswers.length === 1) next.correctAnswer = q.correctAnswers[0];
  return next;
}

export function duplicateQuestion(q: QuestionDraft): QuestionDraft {
  return { ...q, clientKey: newClientKey(), id: undefined, options: [...q.options], correctAnswers: [...q.correctAnswers], keywords: [...q.keywords] };
}

export function questionPayload(q: QuestionDraft, order: number) {
  // Send type-relevant fields only. saveQuizDraft replaces the stored row, so
  // omitted fields are cleared rather than retained from a previous type.
  const usesOptions = q.type === "mcq" || q.type === "multi_select" || q.type === "true_false";
  return {
    type: q.type,
    questionText: q.questionText,
    options: usesOptions ? q.options : undefined,
    correctAnswer: q.type === "mcq" || q.type === "true_false" ? q.correctAnswer || undefined : undefined,
    correctAnswers: q.type === "multi_select" ? q.correctAnswers : undefined,
    keywords: q.type === "written" ? q.keywords.filter((k) => k.trim()) : undefined,
    points: q.points,
    timeLimit: q.timeLimit,
    hint: q.hint || undefined,
    explanation: q.explanation || undefined,
    order,
  };
}

/** Every problem that blocks publication, in display order. */
export function publicationProblems(draft: EditorDraft): string[] {
  const problems: string[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) problems.push("Use a URL slug with lowercase letters, numbers and single hyphens.");
  const t = draft.quizSettings.passingThreshold;
  if (!Number.isFinite(t) || t < 0 || t > 100) problems.push("Passing threshold must be between 0 and 100.");
  const pool = draft.quizSettings.poolSize;
  if (!Number.isInteger(pool) || pool < 0) problems.push("The question pool size must be a whole number (0 turns the pool off).");
  else if (pool > draft.questions.length) problems.push(`The question pool draws ${pool} questions but the quiz has ${draft.questions.length}.`);
  problems.push(...publicationErrors(draft.title, draft.questions.map((q, i) => questionPayload(q, i))));
  for (const [i, q] of draft.questions.entries()) {
    if (!Number.isFinite(q.timeLimit) || q.timeLimit < 5 || q.timeLimit > 3600) problems.push(`Question ${i + 1}: timer must be between 5 and 3600 seconds.`);
  }
  return problems;
}

const RECOVERY_VERSION = 2;

export function recoveryRecord(draft: EditorDraft, baseline: string) {
  return JSON.stringify({ version: RECOVERY_VERSION, savedAt: Date.now(), baseline, draft });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export function parseRecovery(raw: string): { draft: EditorDraft; savedAt: number; baseline: string } | null {
  try {
    const value = JSON.parse(raw);
    const d = value?.draft;
    if (value?.version !== RECOVERY_VERSION || !Number.isFinite(value.savedAt) || typeof value.baseline !== "string" || !d) return null;
    if (![d.title, d.description, d.slug, d.groupName].every((v) => typeof v === "string") || !Array.isArray(d.questions) || !d.quizSettings) return null;
    // JSON stores an emptied number input (NaN) as null.
    const num = (v: unknown) => (v === null ? NaN : v);
    const s = d.quizSettings;
    s.passingThreshold = num(s.passingThreshold);
    s.poolSize = typeof s.poolSize === "number" ? s.poolSize : 0;
    if (s.resultRelease !== "manual") s.resultRelease = "immediate";
    if (!["randomizeQuestions", "randomizeOptions", "showCorrectAnswers", "showExplanations", "disableAnimations"].every((k) => typeof s[k] === "boolean") || typeof s.passingThreshold !== "number") return null;
    const keys = new Set<string>();
    for (const q of d.questions) {
      if (!q || typeof q.clientKey !== "string" || keys.has(q.clientKey) || (q.id !== undefined && typeof q.id !== "string")) return null;
      if (!questionTypes.includes(q.type)) return null;
      if (![q.questionText, q.correctAnswer, q.hint, q.explanation].every((v) => typeof v === "string")) return null;
      if (![q.options, q.correctAnswers, q.keywords].every(isStringArray)) return null;
      q.points = num(q.points);
      q.timeLimit = num(q.timeLimit);
      if (typeof q.points !== "number" || typeof q.timeLimit !== "number") return null;
      keys.add(q.clientKey);
    }
    return { draft: d as EditorDraft, savedAt: value.savedAt, baseline: value.baseline };
  } catch {
    return null;
  }
}

/** Moves one item by `delta` places, staying inside the list. Returns the same array when nothing moves. */
export function moveItem<T>(items: T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || delta === 0) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
