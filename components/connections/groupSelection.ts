import type { ConvexReactClient } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { lessonRef } from "./learnShare";

type Client = Pick<ConvexReactClient, "query">;
type Page<T> = { page: T[]; isDone: boolean; continueCursor: string };
export type GroupSelection = { title: string; lessons: { ref: string; title: string }[]; excluded: number };

/** Resolve a finite snapshot. Only setLessonSelection persists access, never a group ref. */
async function ownedLessons(client: Client): Promise<Doc<"lessons">[]> {
  const rows: Doc<"lessons">[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 11; page++) {
    const result: Page<Doc<"lessons">> = await client.query(api.lessons.listOwned, { paginationOpts: { numItems: 50, cursor } });
    rows.push(...result.page);
    if (rows.length > 500) throw new Error("More than 500 lessons: select lessons individually instead.");
    if (result.isDone) return rows;
    cursor = result.continueCursor;
  }
  throw new Error("Lesson selection is incomplete. Select lessons individually instead.");
}

export async function resolveModuleLessons(client: Client, nodeId: Id<"curriculumNodes">, versionId: Id<"curriculumVersions">, title: string): Promise<GroupSelection> {
  const rows = (await ownedLessons(client)).filter(row => row.status === "active");
  const lessons: GroupSelection["lessons"] = [];
  // Four independent lessons at a time; each native read stays bounded.
  for (let offset = 0; offset < rows.length; offset += 4) {
    const matches = await Promise.all(rows.slice(offset, offset + 4).map(async row => {
      let cursor: string | null = null;
      for (let page = 0; page < 10; page++) {
        const result: Page<Doc<"lessonCurriculumMappings">> = await client.query(api.curricula.listLessonMappings, { lessonId: row._id, paginationOpts: { numItems: 25, cursor } });
        if (result.page.some(mapping => mapping.nodeId === nodeId && mapping.versionId === versionId)) return { ref: lessonRef(row._id), title: row.metadata.title };
        if (result.isDone) return null;
        cursor = result.continueCursor;
      }
      throw new Error("Curriculum selection is incomplete. Select lessons individually instead.");
    }));
    lessons.push(...matches.filter((match): match is NonNullable<typeof match> => match !== null));
  }
  return { title, lessons, excluded: 0 };
}
