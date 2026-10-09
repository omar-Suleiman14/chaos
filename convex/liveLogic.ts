// Pure rules for live games (host-led, Kahoot-style play of a quiz). No Convex imports,
// so the server, the host and player screens and the unit tests share one copy.
//
// Grading is not re-implemented here: questions use choiceIsCorrect from formQuiz.ts,
// exactly as a normal attempt would be marked.

import type { FormDefinition, Language } from "./formLogic";
import { choiceIsCorrect } from "./formQuiz";

export const PIN_LENGTH = 6;
/** Answer tiles. Shapes carry the meaning; colours only reinforce it. */
export const LIVE_SHAPES = ["triangle", "diamond", "circle", "square"] as const;
export type LiveShape = (typeof LIVE_SHAPES)[number];
export const MAX_TILES = LIVE_SHAPES.length;
export const MAX_LIVE_QUESTIONS = 100;

export const TIME_LIMITS = [10, 20, 30, 60, 90, 120] as const;
export const DEFAULT_TIME_LIMIT = 20;
export const MIN_TIME_LIMIT = 5;
export const MAX_TIME_LIMIT = 240;
/** Seconds the answer, and then the leaderboard, stay up before autoplay moves on. */
export const BREAKS = [3, 5, 8, 12, 20] as const;
export const DEFAULT_BREAK = 5;
export const MIN_BREAK = 3;
export const MAX_BREAK = 60;
/** The 5-4-3-2-1 before the first question. */
export const START_COUNTDOWN_MS = 5_000;

/** Free hosts: 100 players per game, like the 100-respondent cap on old quizzes. Pro: a safety ceiling. */
export const FREE_PLAYER_LIMIT = 100;
export const PRO_PLAYER_LIMIT = 500;
/** A game nobody has advanced for this long ends by itself and frees its PIN. */
export const IDLE_EXPIRY_MS = 3 * 60 * 60 * 1000;

export const NICKNAME_MAX = 20;

export type LiveState = "lobby" | "question" | "reveal" | "leaderboard" | "ended";
export type LiveKind = "single" | "multi";

export interface LiveOption { id: string; label: string }
export interface LiveQuestion {
  /** Form field id, or the old quiz question id. */
  key: string;
  text: string;
  kind: LiveKind;
  options: LiveOption[];
  /** Option ids that are correct. Never sent to players before the reveal. */
  correct: string[];
  image?: { url: string; alt: string };
  /** Games hosted from classic quizzes before they were retired (stored rows only; `correct` grades them). */
  legacyType?: "mcq" | "true_false" | "multi_select";
  legacyCorrect?: string;
  legacyCorrectList?: string[];
  points?: number;
}

// ── Scoring ────────────────────────────────────────────────────────────────

/** Correct: round(1000 × (1 − (timeTaken / timeLimit) / 2)), so 500–1000. Wrong or late: 0. */
export function answerPoints(correct: boolean, timeTakenMs: number, timeLimitMs: number): number {
  if (!correct || !(timeLimitMs > 0)) return 0;
  const ratio = Math.min(1, Math.max(0, timeTakenMs / timeLimitMs));
  return Math.round(1000 * (1 - ratio / 2));
}

/** +100 for each consecutive correct answer after the second, capped at +500. `streak` includes this answer. */
export function streakBonus(streak: number): number {
  return Math.min(500, Math.max(0, streak - 2) * 100);
}

/** Rank = 1 + number of players with a strictly higher score (ties share a rank). */
export function rankScores<T extends { score: number }>(players: T[]): (T & { rank: number })[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let rank = 0;
  let previous = Number.POSITIVE_INFINITY;
  return sorted.map((p, i) => {
    if (p.score < previous) { rank = i + 1; previous = p.score; }
    return { ...p, rank };
  });
}

// ── Correctness (shared grading helpers) ──────────────────────────────────

export function isCorrectAnswer(question: LiveQuestion, chosen: string[]): boolean {
  return choiceIsCorrect({ type: question.kind === "multi" ? "multi_choice" : "choice", quiz: { correctOptionIds: question.correct, points: 1 } }, chosen);
}

/** Validates a player's choice against the question: known, distinct ids; exactly one for single choice. */
export function cleanChoice(question: LiveQuestion, optionIds: string[]): string[] | null {
  const known = new Set(question.options.map((o) => o.id));
  const unique = [...new Set(optionIds)];
  if (!unique.length || unique.some((id) => !known.has(id))) return null;
  if (question.kind === "single" && unique.length !== 1) return null;
  return unique;
}

// ── Building the question list ────────────────────────────────────────────

function translated(def: FormDefinition, language: Language) {
  return language !== def.defaultLanguage && def.languages.includes(language);
}

/** Quiz-mode form questions that fit on tiles: single choice, dropdown or checkboxes with 2–4 options and an answer key. */
export function questionsFromForm(def: FormDefinition, language: Language = def.defaultLanguage): { questions: LiveQuestion[]; skipped: number } {
  const questions: LiveQuestion[] = [];
  let skipped = 0;
  const useTranslation = translated(def, language);
  for (const field of def.fields) {
    if (field.type !== "choice" && field.type !== "dropdown" && field.type !== "multi_choice") {
      if (field.type !== "statement" && field.type !== "section") skipped++;
      continue;
    }
    const options = field.options ?? [];
    const correct = field.quiz?.correctOptionIds ?? [];
    if (!correct.length || options.length < 2 || options.length > MAX_TILES || questions.length >= MAX_LIVE_QUESTIONS) { skipped++; continue; }
    const tr = useTranslation ? field.translations?.[language] : undefined;
    questions.push({
      key: field.id,
      text: (tr?.label || field.label).slice(0, 500),
      kind: field.type === "multi_choice" ? "multi" : "single",
      options: options.map((o) => ({ id: o.id, label: (tr?.options?.[o.id] || o.label).slice(0, 200) })),
      correct: [...correct],
      ...(field.image ? { image: field.image } : {}),
    });
  }
  return { questions, skipped };
}

// ── Nicknames ─────────────────────────────────────────────────────────────

/** A deliberately small list: obvious slurs and swear words in English and Arabic. Hosts can also remove anyone. */
const BLOCKED = [
  "fuck", "shit", "bitch", "cunt", "dick", "cock", "pussy", "whore", "slut", "nigger", "nigga", "fag", "faggot", "retard",
  "rape", "nazi", "hitler", "penis", "vagina", "porn", "asshole", "bastard", "wank", "twat",
  "كس", "زب", "شرموط", "عاهر", "قحب", "منيك", "خول", "طيز", "زبي", "نيك",
];
/** Short words that are never part of an innocent word, so they match inside others too. */
const ALWAYS = new Set(["fuck", "shit", "cunt", "twat", "wank"]);
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

function squash(text: string): string {
  return Array.from(text.toLowerCase()).map((ch) => LEET[ch] ?? ch).join("").replace(/[^\p{L}]/gu, "");
}

export function isProfane(name: string): boolean {
  const flat = squash(name);
  const words = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(squash);
  return BLOCKED.some((bad) => (bad.length >= 5 || ALWAYS.has(bad) ? flat.includes(bad) : words.includes(bad)));
}

export type NicknameProblem = "empty" | "too_long" | "characters" | "blocked";

/** Trims, collapses spaces and strips invisible and direction-changing characters. */
export function cleanNickname(raw: string): string {
  return Array.from(raw.normalize("NFKC").replace(/\s/g, " "))
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return !(c <= 0x1f || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff);
    })
    .join("").replace(/\s+/g, " ").trim();
}

export function nicknameProblem(name: string): NicknameProblem | null {
  if (!name) return "empty";
  if (Array.from(name).length > NICKNAME_MAX) return "too_long";
  if (!/^[\p{L}\p{M}\p{N} _.'-]+$/u.test(name)) return "characters";
  if (isProfane(name)) return "blocked";
  return null;
}

/** Case- and width-insensitive key so "Sam" and "sam" can't both join. */
export function nicknameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
}

export function isValidPin(pin: string): boolean {
  return /^[1-9]\d{5}$/.test(pin);
}

// ── Clock ─────────────────────────────────────────────────────────────────

/** Whole seconds left, from the server's end time and this device's offset (serverNow − localNow). */
export function secondsLeft(endsAt: number, localNow: number, offsetMs: number): number {
  return Math.max(0, Math.ceil((endsAt - (localNow + offsetMs)) / 1000));
}

/** Offset estimate from one round trip: the server read its clock about halfway through. */
export function clockOffset(sentAt: number, receivedAt: number, serverNow: number): number {
  return Math.round(serverNow - (sentAt + receivedAt) / 2);
}
