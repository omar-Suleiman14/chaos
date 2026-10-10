import type { Answers, FormDefinition } from "./formLogic";
import { publicQuizDefinition } from "./formQuiz";

/** Clients can refresh at this boundary without receiving unreleased field identifiers. */
export function nextFieldReleaseAt(def: FormDefinition, now: number): number | null {
  const future = def.fields.flatMap(f => f.releasesAt !== undefined && Number.isSafeInteger(f.releasesAt) && f.releasesAt > now ? [f.releasesAt] : []);
  return future.length ? Math.min(...future) : null;
}

/** Section gates reset at the next section. Missing timestamps preserve old records. */
export function releasedFieldIds(def: FormDefinition, now: number): Set<string> {
  const ids = new Set<string>();
  let sectionReleased = true;
  for (const field of def.fields) {
    const released = field.releasesAt === undefined || (Number.isSafeInteger(field.releasesAt) && field.releasesAt >= 0 && field.releasesAt <= now);
    if (field.type === "section") sectionReleased = released;
    const dependenciesReleased = !field.showIf?.conditions.some(c => c.fieldId !== "calc:score" && !ids.has(c.fieldId));
    if (sectionReleased && released && dependenciesReleased) ids.add(field.id);
    else if (field.type === "section") sectionReleased = false;
  }
  return ids;
}

/** Removes unreleased content and rules referencing it before any public serialization. */
export function releasedDefinition(def: FormDefinition, now: number): FormDefinition {
  const ids = releasedFieldIds(def, now);
  return { ...def, fields: def.fields.filter(f => ids.has(f.id)),
    endings: def.endings.filter(e => !e.showIf?.conditions.some(c => c.fieldId !== "calc:score" && !ids.has(c.fieldId))) };
}

/**
 * What anyone other than the owner may see of a form version at `now`: released content only,
 * without answer keys. Every non-owner projection (respondents, homework, forks) uses this.
 */
export function respondentDefinition(def: FormDefinition, now: number): FormDefinition {
  return publicQuizDefinition(releasedDefinition(def, now));
}

/** Reject early writes rather than silently accepting/dropping guessed answers. */
export function assertReleasedAnswers(def: FormDefinition, answers: Answers, now: number): void {
  const ids = releasedFieldIds(def, now);
  if (def.fields.some(f => !ids.has(f.id) && Object.prototype.hasOwnProperty.call(answers, f.id))) {
    throw new Error("FIELD_NOT_RELEASED: An answered question is not available yet. Reload the form.");
  }
}

export function releasedAnswers(def: FormDefinition, answers: Answers, now: number): Answers {
  const ids = releasedFieldIds(def, now);
  return Object.fromEntries(Object.entries(answers).filter(([id]) => ids.has(id)));
}
