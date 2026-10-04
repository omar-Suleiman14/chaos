"use client";
import { createContext, useContext } from "react";
export type Activity = { kind: "form" | "quiz" | "flashcards"; id: string; known?: number; total?: number };
export const LessonActivity = createContext<(activity: Activity) => void>(() => {});
export const useLessonActivity = () => useContext(LessonActivity);
