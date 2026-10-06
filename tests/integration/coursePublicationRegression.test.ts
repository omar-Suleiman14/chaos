import { describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createTestConvex } from "./setup";
import { createCnsCourse, lessonDoc, signIn, type Client, type T } from "../../perf/lib/fixtures";

/**
 * Regression: a published CNS course got a new module with published
 * lessons, but readers kept seeing the old module structure until the whole
 * course was republished. Intended semantics (convex/courseStructure.ts):
 * publishing a lesson of a live course publishes the course's current
 * structure; course details still wait for "Publish course"; drafts never
 * reach readers.
 */
async function liveCns() {
  const t = createTestConvex();
  const owner = await signIn(t, undefined, "perry");
  const course = await createCnsCourse(owner);
  vi.setSystemTime(Date.now() + 3_600_001);
  return { t, owner, ...course };
}

async function addModule(owner: Client, courseId: Id<"learnCollections">, title: string, lessons: string[]) {
  const ids: Id<"lessons">[] = [];
  for (const lessonTitle of lessons) {
    const lessonId = await owner.mutation(api.courses.addLesson, { courseId, title: lessonTitle });
    await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: lessonDoc(6, { prefix: lessonTitle.replace(/\W/g, "") }) });
    ids.push(lessonId);
  }
  const current = await owner.query(api.courses.get, { courseId });
  await owner.mutation(api.courses.setModules, { courseId, modules: [...current.modules, { id: title.toLowerCase(), title, lessonIds: ids, assessments: [] }] });
  return ids;
}

const publishLesson = async (owner: Client, lessonId: Id<"lessons">) => {
  const draft = await owner.query(api.lessons.getDraft, { lessonId });
  return await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: draft.revision, visibility: "public" });
};
const publicStructure = async (t: T, courseId: Id<"learnCollections">) => {
  const course = (await t.query(api.courses.getPublic, { courseId }))!;
  return course.modules.map((m) => [m.title, m.lessonIds.map((id) => course.lessons.find((l) => l.id === id)!.title)]);
};

describe("course publication", () => {
  it("a new module's lessons appear in the live course as soon as they are published", async () => {
    const { t, owner, courseId } = await liveCns();
    const [tumours, infections] = await addModule(owner, courseId, "Pathology", ["Tumours", "Infections"]);
    // Drafts are not public yet, and the editor says so.
    expect((await publicStructure(t, courseId)).map(([title]) => title)).toEqual(["Anatomy", "Physiology", "Histology"]);
    expect((await owner.query(api.courses.get, { courseId })).lessons.filter((l) => l.changed).map((l) => l.title)).toEqual(["Tumours", "Infections"]);

    await publishLesson(owner, tumours);
    expect(await publicStructure(t, courseId)).toEqual([
      ["Anatomy", ["Meninges", "Ventricles", "Cranial nerves"]],
      ["Physiology", ["Action potentials", "Synapses"]],
      ["Histology", ["Neurons", "Glia"]],
      ["Pathology", ["Tumours"]],
    ]);
    // The unpublished sibling stays out of the live course.
    expect((await t.query(api.courses.getPublic, { courseId }))!.lessons.map((l) => l.id)).not.toContain(infections);

    await publishLesson(owner, infections);
    expect((await publicStructure(t, courseId)).at(-1)).toEqual(["Pathology", ["Tumours", "Infections"]]);
    expect((await owner.query(api.courses.get, { courseId })).pendingChanges).toEqual([]);
  });

  it("course details wait for Publish course, and the editor reports them as pending", async () => {
    const { t, owner, courseId, modules } = await liveCns();
    await owner.mutation(api.courses.update, { courseId, title: "Neuroscience I", description: "Revised" });
    expect((await owner.query(api.courses.get, { courseId })).pendingChanges).toEqual(["details"]);
    await publishLesson(owner, modules[0].lessonIds[0]);
    // A lesson publication does not publish course details.
    expect((await t.query(api.courses.getPublic, { courseId }))!.title).toBe("Central nervous system");
    expect(await owner.mutation(api.courses.publish, { courseId, visibility: "public" })).toEqual({ ok: true });
    expect((await t.query(api.courses.getPublic, { courseId }))!.title).toBe("Neuroscience I");
    expect((await owner.query(api.courses.get, { courseId })).pendingChanges).toEqual([]);
  });

  it("reordering modules is pending until a publication, never silently live", async () => {
    const { t, owner, courseId, modules } = await liveCns();
    await owner.mutation(api.courses.setModules, { courseId, modules: [modules[2], modules[0], modules[1]] });
    expect((await owner.query(api.courses.get, { courseId })).pendingChanges).toEqual(["structure"]);
    expect((await publicStructure(t, courseId)).map(([title]) => title)).toEqual(["Anatomy", "Physiology", "Histology"]);
    await owner.mutation(api.courses.publish, { courseId, visibility: "public" });
    expect((await publicStructure(t, courseId)).map(([title]) => title)).toEqual(["Histology", "Anatomy", "Physiology"]);
  });

  it("never exposes a lesson draft through the course", async () => {
    const { t, owner, courseId, modules } = await liveCns();
    const lessonId = modules[0].lessonIds[0];
    const draft = await owner.query(api.lessons.getDraft, { lessonId });
    await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: draft.revision, document: { schemaVersion: 1, blocks: [{ id: "secret", type: "paragraph", text: "UNPUBLISHED DRAFT", citations: [], conceptIds: [] }] }, metadata: { ...draft.metadata, title: "SECRET TITLE" } });
    const reader = await t.query(api.courses.getPublic, { courseId });
    expect(JSON.stringify(reader)).not.toContain("SECRET");
    const lesson = await t.query(api.learnFrontend.publicLesson, { id: lessonId });
    expect(JSON.stringify(lesson)).not.toContain("UNPUBLISHED DRAFT");
  });
});
