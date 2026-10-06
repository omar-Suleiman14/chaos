import { vi } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { emptyDefinition, type FormDefinition } from "@/convex/formLogic";
import type { LessonBlock, LessonDocument } from "@/convex/learnModel";
import { themeFromPreset, themePresets } from "@/components/forms/formThemes";
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

export type T = ReturnType<typeof createTestConvex>;
export type Client = ReturnType<T["withIdentity"]>;

/** Learn write limits are hourly; move the fake clock so large fixtures stay realistic, not throttled. */
export const nextHour = () => vi.setSystemTime(Date.now() + 3_600_001);

type FieldOptions = { conditional?: boolean; sections?: boolean; images?: boolean; quiz?: boolean };

export function formFields(count: number, options: FieldOptions = {}): FormDefinition["fields"] {
  const fields: FormDefinition["fields"] = [];
  for (let i = 0; i < count; i++) {
    const id = `q${i}`;
    if (options.sections && i > 0 && i % 10 === 0) fields.push({ id: `s${i}`, type: "section", label: `Part ${i / 10 + 1}`, required: false });
    const showIf = options.conditional && i >= 4 && i % 4 === 0
      ? { match: "all" as const, conditions: [{ fieldId: `q${i - 4}`, op: "equals" as const, value: "a" }] }
      : undefined;
    const imageUrl = options.images && i % 3 === 0 ? `https://images.example.com/perf/${i}.jpg` : undefined;
    const base = { id, label: `Question ${i + 1}: describe the mechanism in your own words`, required: i % 2 === 0, ...(showIf ? { showIf } : {}), ...(imageUrl ? { imageUrl } : {}) };
    switch (i % 5) {
      case 0: case 1:
        fields.push({ ...base, type: i % 5 === 0 ? "choice" : "multi_choice", options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }, { id: "c", label: "Gamma" }, { id: "d", label: "Delta" }],
          ...(options.quiz ? { quiz: { correctOptionIds: ["a"], points: 1 } } : {}) });
        break;
      case 2: fields.push({ ...base, type: "text" }); break;
      case 3: fields.push({ ...base, type: "rating", max: 5 }); break;
      default: fields.push({ ...base, type: "textarea" });
    }
  }
  return fields;
}

export function formDefinition(title: string, count: number, options: FieldOptions & { theme?: boolean } = {}): FormDefinition {
  const def = emptyDefinition(title);
  def.fields = formFields(count, options);
  if (options.sections) def.presentation = "sections";
  if (options.theme) def.theme = themeFromPreset(themePresets[themePresets.length - 1].id);
  return def;
}

const prose = (i: number) => `Paragraph ${i}. The baroreceptor reflex buffers short-term changes in arterial pressure by adjusting heart rate, contractility and vascular tone through autonomic outflow.`;

/** A lesson mixing every block kind that needs no uploaded source. Quiz embeds use `quizFormId` when given. */
export function lessonBlocks(count: number, opts: { quizFormId?: Id<"forms">; prefix?: string } = {}): LessonBlock[] {
  const blocks: LessonBlock[] = [];
  for (let i = 0; i < count; i++) {
    const c = { id: `${opts.prefix ?? "b"}${i}`, citations: [], conceptIds: [] };
    switch (i % 10) {
      case 0: blocks.push({ ...c, type: "heading", level: 2, text: `Section ${i / 10 + 1}` }); break;
      case 1: case 2: case 5: blocks.push({ ...c, type: "paragraph", text: prose(i) }); break;
      case 3: blocks.push({ ...c, type: "table", headerRows: 1, rows: [["Receptor", "Location", "Effect"], ["α1", "Vessels", "Constriction"], ["β1", "Heart", "Rate up"], ["M2", "SA node", "Rate down"]] }); break;
      case 4: blocks.push({ ...c, type: "toggle", text: `Why does pressure fall on standing? (${i})` }); break;
      case 6: blocks.push({ ...c, type: "diagram", format: "mermaid", text: "graph LR; A[Stretch] --> B[NTS]; B --> C[Vagal outflow]" }); break;
      case 7: blocks.push({ ...c, type: "youtube", videoId: "dQw4w9WgXcQ", caption: `Video ${i}` }); break;
      case 8: blocks.push(opts.quizFormId ? { ...c, type: "quiz", asset: { kind: "form", id: opts.quizFormId } } : { ...c, type: "callout", tone: "key", text: `Key point ${i}` }); break;
      default: blocks.push({ ...c, type: "list", style: "bullet", text: `Item ${i}` });
    }
  }
  return blocks;
}

export const lessonDoc = (count: number, opts?: Parameters<typeof lessonBlocks>[1]): LessonDocument => ({ schemaVersion: 1, blocks: lessonBlocks(count, opts) });
export const lessonMeta = (title: string) => ({ title, description: `${title}, perf fixture`, language: "en", tags: ["perf"] });

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
