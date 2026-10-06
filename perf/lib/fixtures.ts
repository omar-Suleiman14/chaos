import { vi } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FormDefinition } from "@/convex/formLogic";
import { formDefinition, lessonBlocks, lessonDoc, lessonMeta, type LessonRefs } from "./content";
import { createTestConvex } from "@/tests/integration/setup";

/**
 * Representative, deterministic workspace for performance budgets. Sizes are
 * fixed so every metric is comparable run to run; change them only together
 * with the baselines (perf/README.md, "Changing the harness").
 */
export const WORKSPACE = { forms: 24, quizzes: 8, lessons: 12, lessonBlocks: 40, livePlayers: 30 } as const;

/** MCP transport ids must be `user_[A-Za-z0-9]+`, so the perf creator has its own identity. */
export const perfCreator = {
  subject: "user_perfcreator",
  issuer: "https://chaos.test.clerk.accounts.dev",
  tokenIdentifier: "https://chaos.test.clerk.accounts.dev|user_perfcreator",
  email: "perf-creator@example.com",
  name: "Perry Perf",
  nickname: "perry",
};
export const perfStudent = {
  subject: "user_perfstudent",
  issuer: "https://chaos.test.clerk.accounts.dev",
  tokenIdentifier: "https://chaos.test.clerk.accounts.dev|user_perfstudent",
  email: "perf-student@example.com",
  name: "Sam Student",
  nickname: "sam",
};

export { formDefinition, formFields, largeLessonBlocks, LARGE_LESSON_MIX, lessonBlocks, lessonDoc, lessonMeta, type LessonRefs } from "./content";
export type T = ReturnType<typeof createTestConvex>;
export type Client = ReturnType<T["withIdentity"]>;

/** Learn write limits are hourly; move the fake clock so large fixtures stay realistic, not throttled. */
export const nextHour = () => vi.setSystemTime(Date.now() + 3_600_001);


export async function signIn(t: T, identity = perfCreator, username?: string) {
  const user = t.withIdentity(identity);
  await user.mutation(api.quizFunctions.getOrCreateUser, {});
  if (username) await user.mutation(api.links.chooseUsername, { username });
  return user;
}

export async function createPublishedForm(owner: Client, definition: FormDefinition, quizMode = false) {
  const formId = await owner.mutation(api.forms.createForm, quizMode ? { quizMode: true } : { definition });
  const initial = (await owner.query(api.forms.getFormForEditor, { formId }))!;
  const next = quizMode ? { ...initial.draft, title: definition.title, fields: definition.fields } : definition;
  const saved = await owner.mutation(api.forms.saveFormDraft, { formId, expectedRevision: initial.draftRevision, definition: next });
  await owner.mutation(api.forms.publishForm, { formId, expectedRevision: saved.draftRevision });
  const shareId = (await owner.query(api.forms.getFormForEditor, { formId }))!.shareId;
  return { formId, shareId };
}

export async function createPublishedLesson(owner: Client, title: string, blocks: number, opts?: Parameters<typeof lessonBlocks>[1]) {
  const lessonId = await owner.mutation(api.lessons.create, { metadata: lessonMeta(title), document: lessonDoc(blocks, opts) });
  const draft = await owner.query(api.lessons.getDraft, { lessonId });
  await owner.mutation(api.lessons.publish, { lessonId, expectedRevision: draft.revision, visibility: "public" });
  return lessonId;
}

/** What a large lesson embeds, all real and publishable: a stored public image, a published flashcard set and a published quiz. */
export async function seedLessonRefs(t: T, owner: Client, identity = perfCreator): Promise<LessonRefs> {
  const { formId: quizFormId } = await createPublishedForm(owner, formDefinition("Checkpoint", 5, { quiz: true }), true);
  const flashcardSetId = await owner.mutation(api.flashcards.create, { title: "Receptors", cards: [{ id: "c1", front: "α1", back: "Constriction", conceptIds: [] }, { id: "c2", front: "β1", back: "Rate up", conceptIds: [] }] });
  await owner.mutation(api.flashcards.publish, { setId: flashcardSetId, expectedRevision: 0, visibility: "public" });
  const imageSourceId = await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["figure"], { type: "image/png" }));
    return ctx.db.insert("learnSources", { ownerId: identity.subject, uploadedBy: identity.subject, metadata: { title: "Figure", kind: "image", origin: "upload" }, metadataVisibility: "public", contentVisibility: "public", createdAt: Date.now(), status: "active", storageId, contentType: "image/png" });
  });
  return { imageSourceId, flashcardSetId, quizFormId };
}

export const CNS_MODULES = [["Anatomy", ["Meninges", "Ventricles", "Cranial nerves"]], ["Physiology", ["Action potentials", "Synapses"]], ["Histology", ["Neurons", "Glia"]]] as const;

/** The CNS course from real bug reports: three modules whose numbering must restart per module. */
export async function createCnsCourse(owner: Client, publish = true) {
  const courseId = await owner.mutation(api.courses.create, { title: "Central nervous system" });
  const modules: { id: string; title: string; lessonIds: Id<"lessons">[]; assessments: { kind: "form" | "quiz"; id: string }[] }[] = [];
  for (const [title, lessons] of CNS_MODULES) {
    const lessonIds: Id<"lessons">[] = [];
    for (const lessonTitle of lessons) {
      const lessonId = await owner.mutation(api.courses.addLesson, { courseId, title: lessonTitle });
      await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: lessonDoc(12, { prefix: lessonTitle.replace(/\W/g, "") }) });
      lessonIds.push(lessonId);
    }
    modules.push({ id: title.toLowerCase(), title, lessonIds, assessments: [] });
  }
  await owner.mutation(api.courses.setModules, { courseId, modules });
  if (publish) await owner.mutation(api.courses.publish, { courseId, visibility: "public" });
  return { courseId, modules };
}

export const playerToken = (i: number) => (i + 1).toString(16).padStart(2, "0").repeat(16);

/** Random covers and ids change payload sizes run to run; a seeded generator keeps bytes comparable. */
export function seedRandom(seed = 42) {
  let state = seed >>> 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  });
}

/** Rate-limit windows and timestamps depend on the clock; every perf run starts at the same instant. */
export const PERF_EPOCH = Date.UTC(2026, 0, 5, 9, 0, 0);
let clock = PERF_EPOCH;
/** Pins the clock where seeding left it. Call from beforeEach, after the shared fake-timer setup. */
export const resumeClock = () => vi.setSystemTime(clock);

/** Seeds the standard workspace. Returns ids for each surface's primary object. */
export async function seedWorkspace(t: T) {
  vi.setSystemTime(PERF_EPOCH);
  seedRandom();
  const owner = await signIn(t, perfCreator, "perry");
  const forms: { formId: Id<"forms">; shareId: string }[] = [];
  for (let i = 0; i < WORKSPACE.forms; i++) forms.push(await createPublishedForm(owner, formDefinition(`Form ${i + 1}`, 12, { conditional: i % 3 === 0, sections: i % 4 === 0 })));
  const quizzes: { formId: Id<"forms">; shareId: string }[] = [];
  for (let i = 0; i < WORKSPACE.quizzes; i++) quizzes.push(await createPublishedForm(owner, formDefinition(`Quiz ${i + 1}`, 10, { quiz: true }), true));
  nextHour();
  const lessons: Id<"lessons">[] = [];
  for (let i = 0; i < WORKSPACE.lessons; i++) lessons.push(await createPublishedLesson(owner, `Lesson ${i + 1}`, WORKSPACE.lessonBlocks, { quizFormId: quizzes[0].formId }));
  nextHour();
  const course = await createCnsCourse(owner);
  const gameId = await owner.mutation(api.live.createGame, { formId: quizzes[0].formId });
  const pin = (await owner.query(api.live.hostView, { gameId }))!.pin;
  const players: string[] = [];
  for (let i = 0; i < WORKSPACE.livePlayers; i++) {
    await t.mutation(api.live.joinGame, { pin, nickname: `Player ${i + 1}`, token: playerToken(i) });
    players.push(playerToken(i));
  }
  clock = Date.now() + 60_000;
  return { owner, forms, quizzes, lessons, course, gameId, pin, players };
}
