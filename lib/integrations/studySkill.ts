import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Fixed allow-list: no caller-controlled filesystem paths. Canonical source ships in every plugin. */
export const studySkillPaths = [
  "SKILL.md",
  "references/workflow.md",
  "references/teaching.md",
] as const;
export async function readStudySkillFiles(): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      studySkillPaths.map(async (path) => [
        `skills/create-study-lesson/${path}`,
        await readFile(
          join(process.cwd(), "skills/create-study-lesson", path),
          "utf8",
        ),
      ]),
    ),
  );
}
