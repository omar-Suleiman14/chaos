export const kinds = ["Forms", "Quizzes", "Flashcards", "Courses", "Games"] as const;
export type Kind = (typeof kinds)[number];
/** The open tab lives in the address (?tab=games) so links, Back and refresh keep it. */
export const kindFromParam = (value: string | null): Kind => kinds.find((k) => k.toLowerCase() === value) ?? "Forms";
