// Pure helpers for choosing Learn assets in the connection picker.
// `lesson_<id>` grants are stored by convex/learnIntegrations.ts setLessonSelection.
// `folder_<id>` and `curriculum_<moduleId>` picks have no backend grant yet and stay on screen.

import type { CurriculumNode, Folder, Lesson } from "@/lib/learn/types";

export const lessonRef = (id: string) => `lesson_${id}`;
export const folderRef = (id: string) => `folder_${id}`;
export const curriculumRef = (moduleId: string) => `curriculum_${moduleId}`;
export const isLearnRef = (ref: string) => /^(lesson|folder|source|curriculum)_/.test(ref);
/** v1 references (forms and quizzes), the only ones updateConnection accepts. */
export const isItemRef = (ref: string) => /^(form|quiz)_/.test(ref);
/** Convex lesson ids from `lesson_<id>` references. */
export const lessonIdsFromRefs = (refs: readonly string[]) => refs.filter((r) => r.startsWith("lesson_")).map((r) => r.slice(7));
export const sourceIdsFromRefs = (refs: readonly string[]) => refs.filter((r) => r.startsWith("source_")).map((r) => r.slice(7));

export interface CurriculumGroup {
  moduleId: string;
  /** "University › Program › Module". */
  label: string;
  versionLabel: string;
  lessonRefs: string[];
}

/**
 * Lessons grouped by the curriculum modules they are mapped to. A lesson in several
 * modules appears in each; unmapped lessons are left out. Module names come from the
 * curriculum tree when given, otherwise from the path stored on the lesson.
 */
export function curriculumGroups(lessons: readonly Lesson[], nodes?: readonly CurriculumNode[]): CurriculumGroup[] {
  const byId = new Map(nodes?.map((n) => [n.id, n]));
  const groups = new Map<string, CurriculumGroup>();
  for (const lesson of lessons) {
    if (lesson.archived) continue;
    for (const c of lesson.draft.meta.curricula) {
      const key = `${c.versionId}:${c.moduleId}`;
      let group = groups.get(key);
      if (!group) {
        const node = byId.get(c.moduleId);
        const path = c.path.length ? [...c.path] : [];
        if (node) {
          const name = node.code ? `${node.code} ${node.name}` : node.name;
          if (path.length) path[path.length - 1] = name; else path.push(name);
        }
        group = { moduleId: c.moduleId, label: path.join(" › ") || c.moduleId, versionLabel: c.versionLabel, lessonRefs: [] };
        groups.set(key, group);
      }
      const ref = lessonRef(lesson.id);
      if (!group.lessonRefs.includes(ref)) group.lessonRefs.push(ref);
    }
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label) || a.versionLabel.localeCompare(b.versionLabel));
}

/** Add or remove every ref in `refs` from `value`, keeping order and no duplicates. */
export function toggleRefs(value: readonly string[], refs: readonly string[], on: boolean): string[] {
  if (on) return [...value, ...refs.filter((r) => !value.includes(r))];
  const drop = new Set(refs);
  return value.filter((r) => !drop.has(r));
}

/** "all" | "some" | "none" of `refs` selected, for tri-state checkboxes. */
export function selectionState(value: readonly string[], refs: readonly string[]): "all" | "some" | "none" {
  const n = refs.filter((r) => value.includes(r)).length;
  return n === 0 ? "none" : n === refs.length ? "all" : "some";
}

export function learnSelectionCounts(value: readonly string[]): { lessons: number; collections: number; curricula: number } {
  return {
    lessons: value.filter((r) => r.startsWith("lesson_")).length,
    collections: value.filter((r) => r.startsWith("folder_")).length,
    curricula: value.filter((r) => r.startsWith("curriculum_")).length,
  };
}

/** Folders that can be shared: not archived; collections first, then by name. */
export function shareableFolders(folders: readonly Folder[]): Folder[] {
  return folders.filter((f) => !f.archived).sort((a, b) => Number(!!b.collection) - Number(!!a.collection) || a.name.localeCompare(b.name));
}
