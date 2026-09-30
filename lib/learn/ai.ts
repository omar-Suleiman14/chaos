import type { AiAction, TutorPart } from "./types";

/**
 * In-product AI for Learn (tutor answers and editor assist). Chaos does not ship a model
 * provider: these calls go to the Learn backend when `capabilities.ai` is true and fail with
 * `AI_UNAVAILABLE` otherwise, and the UI offers the ChatGPT/Claude handoff instead.
 *
 * Contract for the backend: every answer is split into parts marked `lesson` or `source` when
 * grounded in the lesson/its sources (with block/source references) and `general` for anything
 * added beyond them. The UI draws these differently; never mark general knowledge as grounded.
 */

export class AiUnavailableError extends Error { constructor() { super("AI_UNAVAILABLE"); } }

export interface TutorRequest { lessonId: string; version?: number; question: string; selection?: string; blockId?: string; history: { role: "user" | "tutor"; text: string }[] }
export interface AssistRequest { lessonId: string; action: AiAction; text: string; blockIds: string[]; language: string }

export type LearnAi = {
  tutor: (req: TutorRequest) => Promise<TutorPart[]>;
  assist: (req: AssistRequest) => Promise<string>;
};

const unavailable: LearnAi = {
  tutor: async () => { throw new AiUnavailableError(); },
  assist: async () => { throw new AiUnavailableError(); },
};

export const learnAi: LearnAi = unavailable;
