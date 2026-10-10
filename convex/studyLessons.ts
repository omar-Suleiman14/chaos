import { revision } from "./studyLessonRevision";
import { bounded, fail } from "./studyLessonBounds";
import { studyValue } from "./studyLessonValue";
import { v, type Infer } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  env,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { courseModule } from "./learnAssetModel";
import { consumeRate } from "./serverUtils";
import { requireActiveUser, creatorRestricted } from "./authz";
import { requireLearnActor } from "./mcpLearn";
import {
  studyRequest,
  studyPart,
  teachingProfile,
  type StudyPart,
} from "./studyLessonModel";
import {
  createLessonForActor,
  publishLessonForActor,
  publicationProblems,
} from "./lessons";
import { createFlashcardSet, publishFlashcardSet } from "./flashcards";
import { createFormRecord, publishNow } from "./forms";
import { parseFormInput, toDefinition, fromDefinition } from "./mcpContract";
import { checkDefinition } from "./formLogic";
import { saveGlossaryForActor } from "./lessonGlossary";
import { setOutlineCourse, setCourseModules, publishCourse } from "./courses";
import { attachAssessmentForActor } from "./learnCollections";
import { attachFlashcardsForActor } from "./flashcardStudy";
import { assertDocument } from "./learnValidation";
import type { LessonBlock } from "./learnModel";

const base = { jobId: v.id("studyLessonJobs") };
const edit = { ...base, expectedRevision: v.number() };
const actor = { userId: v.string() };
async function owned(
  ctx: QueryCtx,
  ownerId: string,
  jobId: Id<"studyLessonJobs">,
) {
  const job = await ctx.db.get("studyLessonJobs", jobId);
  if (!job || job.ownerId !== ownerId)
    throw new Error("NOT_FOUND: Study job not found.");
  return job;
}

async function parts(ctx: QueryCtx, jobId: Id<"studyLessonJobs">) {
  return ctx.db
    .query("studyLessonParts")
    .withIndex("by_job_key", (q) => q.eq("jobId", jobId))
    .take(201);
}
function result(job: Awaited<ReturnType<typeof owned>>) {
  return {
    jobId: job._id,
    revision: job.revision,
    status: job.state,
    lessonId: job.lessonId ?? null,
    lessonUrl: job.lessonId
      ? `${(env.CHAOS_APP_URL ?? "https://chaos.fail").replace(/\/+$/, "")}/learn/${job.lessonId}`
      : null,
    assets: job.assetIds,
    problems: job.problems,
    profile: job.profile,
    request: job.request,
    resolvedCourseId: job.resolvedCourseId ?? null,
    resolvedModuleId: job.resolvedModuleId ?? null,
    summary: {
      assets: job.assetIds.length,
      checkpoints: job.assetIds.length ? job.assetIds.length - 1 : 0,
      flashcardSets: job.assetIds.length ? 1 : 0,
      sections: job.counts?.sections ?? 0,
      questions: job.counts?.questions ?? 0,
      cards: job.counts?.cards ?? 0,
      glossaryTerms: job.counts?.glossaryTerms ?? 0,
      media: job.counts?.media ?? 0,
      sources: job.counts?.sources ?? job.request.sources.length,
    },
    progress: {
      stage: job.stage ?? "source_access",
      savedCheckpoints: job.partCount,
      checkpointBytes: job.checkpointBytes,
    },
    nextAction:
      job.state === "collecting"
        ? "Read all sources and save teaching checkpoints; then finalize_study_lesson."
        : job.state === "published"
          ? "Complete."
          : "Inspect validation problems and draft. Publish only when authorized.",
  };
}
export async function startStudyLesson(
  ctx: MutationCtx,
  ownerId: string,
  request: Infer<typeof studyRequest>,
) {
  bounded(request, 20000);
  if (
    !/^[A-Za-z0-9_-]{1,160}$/.test(request.key) ||
    !request.title.trim() ||
    request.title.length > 200 ||
    !request.sources.length ||
    request.sources.length > 50 ||
    request.sources.some(
      (s) => !s.label.trim() || (!s.sourceId && !s.reference),
    )
  )
    fail(
      "Use a stable key, a title and 1–50 source IDs or accessible references.",
    );
  const prior = await ctx.db
    .query("studyLessonJobs")
    .withIndex("by_owner_key", (q) =>
      q.eq("ownerId", ownerId).eq("key", request.key),
    )
    .unique();
  if (prior) {
    if (studyValue(prior.request) !== studyValue(request))
      fail(
        "This key belongs to a different request. Resume it or choose another key.",
      );
    return result(prior);
  }
  let courseId = request.courseId;
  if (!courseId && request.courseTitle) {
    const matches = await ctx.db
      .query("learnCollections")
      .withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", ownerId))
      .take(101);
    if (matches.length > 100)
      fail("Use an exact courseId for accounts with more than 100 courses.");
    const mine = matches.filter(
      (c) =>
        c.ownerId === ownerId &&
        !c.archived &&
        c.metadata.title.toLocaleLowerCase() ===
          request.courseTitle!.toLocaleLowerCase(),
    );
    if (mine.length !== 1)
      fail(
        "Course title is missing or ambiguous; list_courses and provide its exact ID.",
      );
    courseId = mine[0]._id;
  }
  let courseRevision: number | undefined;
  let courseStructure: string | undefined;
  let resolvedModuleId = request.moduleId;
  if (courseId) {
    const c = await ctx.db.get("learnCollections", courseId);
    if (!c || c.ownerId !== ownerId || c.archived || c.communityState !== "ok")
      throw new Error("NOT_FOUND: Active owned course required.");
    courseRevision = c.revision;
    courseStructure = studyValue([c.lessonIds ?? [], c.modules ?? []]);
    if (
      request.afterLessonId &&
      !(c.lessonIds ?? []).includes(request.afterLessonId)
    )
      fail("Placement lesson is not in this course.");
    if (request.moduleTitle && !request.moduleId) {
      const matches = (c.modules ?? []).filter(
        (m) =>
          m.title.toLocaleLowerCase() ===
          request.moduleTitle!.toLocaleLowerCase(),
      );
      if (matches.length !== 1)
        fail(
          "Module title is missing or ambiguous; get_course and supply moduleId.",
        );
      resolvedModuleId = matches[0].id;
    }
    if (
      resolvedModuleId &&
      !(c.modules ?? []).some((m) => m.id === resolvedModuleId)
    )
      fail("Module is not in this course.");
    if (
      resolvedModuleId &&
      request.afterLessonId &&
      !(c.modules ?? [])
        .find((m) => m.id === resolvedModuleId)
        ?.lessonIds.includes(request.afterLessonId)
    )
      fail("Placement anchor must be within the selected module.");
  } else if (request.moduleId || request.moduleTitle || request.afterLessonId)
    fail("Module and placement require a course.");
  for (const s of request.sources)
    if (s.sourceId) await accessibleStudySource(ctx, ownerId, s.sourceId);
  const defaults = await ctx.db
    .query("studyTeachingProfiles")
    .withIndex("by_owner_scope", (q) =>
      q.eq("ownerId", ownerId).eq("scope", "default"),
    )
    .unique();
  const courseProfile = courseId
    ? await ctx.db
        .query("studyTeachingProfiles")
        .withIndex("by_owner_scope", (q) =>
          q.eq("ownerId", ownerId).eq("scope", courseId!),
        )
        .unique()
    : null;
  const profile = {
    language: "en",
    sound: "off" as const,
    publish: false,
    visibility: "public" as const,
    ...defaults?.profile,
    ...courseProfile?.profile,
    ...request.preferences,
  };
  if (profile.theme && !profile.themeDesign)
    fail(
      "Resolve the theme using Chaos theme presets before starting this job.",
    );
  const identity = studyValue([
    request.title.trim().toLocaleLowerCase(),
    courseId ?? null,
    resolvedModuleId ?? null,
    request.sources.map((s) => s.sourceId ?? s.reference?.trim()),
  ]);
  const same = await ctx.db
    .query("studyLessonJobs")
    .withIndex("by_owner_identity", (q) =>
      q.eq("ownerId", ownerId).eq("identity", identity),
    )
    .unique();
  if (same) return result(same);
  await consumeRate(ctx, `learn:study-jobs:${ownerId}`, 60, 3600000);
  const jobId = await ctx.db.insert("studyLessonJobs", {
    ownerId,
    identity,
    key: request.key,
    request,
    profile,
    state: "collecting",
    revision: 0,
    checkpointBytes: 0,
    partCount: 0,
    courseRevision,
    courseStructure,
    resolvedCourseId: courseId,
    resolvedModuleId,
    assetIds: [],
    problems: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  // Keep the original request byte-for-byte for idempotency; resolved placement is returned separately by reads.

  return result((await ctx.db.get("studyLessonJobs", jobId))!);
}
export async function accessibleStudySource(
  ctx: QueryCtx,
  ownerId: string,
  sourceId: Id<"learnSources">,
) {
  const s = await ctx.db.get("learnSources", sourceId);
  if (!s || s.status !== "active" || (await creatorRestricted(ctx, s.ownerId)))
    throw new Error("NOT_FOUND: Source unavailable.");
  const grant =
    s.ownerId !== ownerId
      ? await ctx.db
          .query("learnSourceGrants")
          .withIndex("by_sourceId_and_userId", (q) =>
            q.eq("sourceId", sourceId).eq("userId", ownerId),
          )
          .unique()
      : null;
  if (
    s.ownerId !== ownerId &&
    ((s.contentVisibility !== "public" && !grant?.content) ||
      (s.metadataVisibility !== "public" && !grant?.metadata))
  )
    throw new Error("FORBIDDEN: Source content and metadata access required.");
  if (s.storageId && !(await ctx.db.system.get("_storage", s.storageId)))
    fail("Source file is missing.");
  return s;
}
export async function checkpointStudyLesson(
  ctx: MutationCtx,
  ownerId: string,
  args: Infer<typeof checkpointArgs>,
) {
  const job = await owned(ctx, ownerId, args.jobId);
  bounded(args.value, 210000);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(args.key))
    fail("Use a stable checkpoint key.");
  const prior = await ctx.db
    .query("studyLessonParts")
    .withIndex("by_job_key", (q) =>
      q.eq("jobId", args.jobId).eq("key", args.key),
    )
    .unique();
  if (prior && studyValue(prior.value) === studyValue(args.value))
    return result(job);
  revision(job.revision, args.expectedRevision);
  const valueBytes = new TextEncoder().encode(studyValue(args.value)).length;
  const previousBytes = prior
    ? new TextEncoder().encode(studyValue(prior.value)).length
    : 0;
  const checkpointBytes = job.checkpointBytes + valueBytes - previousBytes;
  if (checkpointBytes > 700000)
    fail(
      "Combined checkpoints exceed 700 KB; split this material into multiple lessons.",
    );
  if (job.lessonId)
    fail(
      "This job already has a lesson. Edit that lesson with revision-safe Learn tools.",
    );
  if ((await parts(ctx, job._id)).length >= 200 && !prior)
    fail("At most 200 checkpoints per job.");
  if (args.value.kind === "reading") {
    const r = args.value;
    if (
      !Number.isSafeInteger(r.sourceIndex) ||
      !job.request.sources[r.sourceIndex] ||
      (job.request.sources[r.sourceIndex].sourceId &&
        job.request.sources[r.sourceIndex].sourceId !== r.sourceId)
    )
      fail("Reading must match a requested source.");
    await accessibleStudySource(ctx, ownerId, r.sourceId);
  }
  if (prior)
    await ctx.db.patch("studyLessonParts", prior._id, { value: args.value });
  else
    await ctx.db.insert("studyLessonParts", {
      jobId: args.jobId,
      key: args.key,
      value: args.value,
    });
  await ctx.db.patch("studyLessonJobs", job._id, {
    revision: job.revision + 1,
    checkpointBytes,
    partCount: job.partCount + (prior ? 0 : 1),
    stage: args.value.kind,
    problems: [],
    state: "collecting",
    updatedAt: Date.now(),
  });
  return result((await ctx.db.get("studyLessonJobs", job._id))!);
}
const checkpointArgs = v.object({ ...edit, key: v.string(), value: studyPart });

/** Client supplies teaching content, never a backend-generated summary. All assets commit atomically. */
export async function finalizeStudyLesson(
  ctx: MutationCtx,
  ownerId: string,
  args: Infer<typeof finalizeArgs>,
) {
  const job = await owned(ctx, ownerId, args.jobId);
  if (job.lessonId) return result(job);
  revision(job.revision, args.expectedRevision);
  const values = (await parts(ctx, job._id)).map((p) => p.value);
  bounded(values, 700000);
  const of = <K extends StudyPart["kind"]>(kind: K) =>
    values.filter((p): p is Extract<StudyPart, { kind: K }> => p.kind === kind);
  const readings = of("reading"),
    sections = of("section").sort((a, b) => a.order - b.order),
    checkpoints = of("checkpoint").sort((a, b) => a.order - b.order),
    decks = of("flashcards"),
    reviews = of("review");
  const problems: string[] = [];
  const complete = (n: number, units: number[]) =>
    Number.isSafeInteger(n) &&
    n > 0 &&
    n <= 10000 &&
    new Set(units).size === n &&
    units.every((i) => Number.isSafeInteger(i) && i >= 1 && i <= n);
  // Keep every checkpoint in its original order: duplicates must still fail validation.
  const readingsBySource = new Map<number, typeof readings>();
  for (const reading of readings) {
    const sourceIndex = reading.sourceIndex;
    const group = readingsBySource.get(sourceIndex) ?? [];
    group.push(reading);
    readingsBySource.set(sourceIndex, group);
  }
  for (let i = 0; i < job.request.sources.length; i++) {
    const rs = readingsBySource.get(i) ?? [];
    if (
      rs.length !== 1 ||
      !complete(rs[0].totalUnits, rs[0].readUnits) ||
      rs[0].visualUnits.some(
        (u) =>
          !rs[0].inspectedVisualUnits.includes(u) ||
          !rs[0].readUnits.includes(u),
      )
    )
      problems.push(
        `Source ${i + 1}: record complete reading and inspection of all figures, tables and captions.`,
      );
  }
  for (const r of readings)
    await accessibleStudySource(ctx, ownerId, r.sourceId);
  if (
    !sections.length ||
    new Set(sections.map((s) => s.order)).size !== sections.length ||
    sections.some((s) => !Number.isSafeInteger(s.order))
  )
    problems.push("Teaching sections need unique integer order.");
  if (decks.length !== 1 || !decks[0].cards.length)
    problems.push(
      "Provide one comprehensive flashcard checkpoint (or reuse a deck). ",
    );
  if (reviews.length !== 1)
    problems.push(
      "Provide one final review with metadata, coverage and media verification.",
    );
  const blocks: LessonBlock[] = sections.flatMap((s) => s.blocks);
  if (blocks.some((b) => b.type === "quiz" || b.type === "flashcards"))
    problems.push(
      "Use checkpoint/deck parts for embedded assets; do not insert untracked quiz or flashcard blocks.",
    );
  const cited = new Set(
    blocks.flatMap((b) => b.citations.map((c) => c.sourceId)),
  );
  for (const r of readings)
    if (!cited.has(r.sourceId))
      problems.push(
        `Source ${r.sourceIndex + 1}: teaching needs source citations.`,
      );
  const concepts = new Set(readings.flatMap((r) => r.concepts));
  const taught = new Set(sections.flatMap((s) => s.concepts));
  for (const c of concepts)
    if (!taught.has(c) || !reviews[0]?.coveredConcepts.includes(c))
      problems.push(`Missing concept coverage: ${c}`);
  for (const c of concepts)
    if (!decks[0]?.cards.some((card) => card.conceptIds.includes(c)))
      problems.push(`Flashcards do not cover concept: ${c}`);
  const fronts =
    decks[0]?.cards.map((c) => c.front.trim().toLocaleLowerCase()) ?? [];
  if (new Set(fronts).size !== fronts.length)
    problems.push("Remove duplicate flashcard prompts.");
  for (const b of blocks)
    if (
      ["image", "youtube", "diagram"].includes(b.type) &&
      !reviews[0]?.verifiedMediaBlockIds.includes(b.id)
    )
      problems.push(
        `Verify media/diagram ${b.id} with the client before finalizing.`,
      );
  for (const source of of("question_source"))
    if (
      !source.topic.trim() ||
      !source.source.trim() ||
      (job.request.quizSource && source.source !== job.request.quizSource)
    )
      problems.push(
        "Question source must match requested integration and record lecture/topic verification.",
      );
  const originals = of("question_source").flatMap((s) => s.questions);
  const originalMap = new Map(originals.map((q) => [q.id, q]));
  if (originals.some((q) => !Number.isSafeInteger(q.order) || q.order < 0))
    problems.push("Original question order must be a nonnegative integer.");
  if (
    originalMap.size !== originals.length ||
    new Set(originals.map((q) => q.order)).size !== originals.length
  )
    problems.push("Original questions need unique IDs and source order.");
  const used: string[] = [];
  if (job.request.quizSource && !of("question_source").length)
    problems.push(
      "Requested question source has not been retrieved. Report unsupported/unavailable integration; do not substitute generated questions silently.",
    );
  for (const cp of checkpoints) {
    if (
      !blocks.some((b) => b.id === cp.afterBlockId) ||
      !cp.questions.length ||
      !Number.isSafeInteger(cp.order)
    )
      problems.push(
        `Checkpoint ${cp.title}: valid section anchor, order and questions required.`,
      );
    for (const q of cp.questions) {
      if (
        q.options.length < 2 ||
        new Set(q.options).size !== q.options.length ||
        new Set(q.correctAnswers).size !== q.correctAnswers.length ||
        !q.explanation.trim() ||
        !q.evidence.length ||
        !q.correctAnswers.length ||
        q.correctAnswers.some((a) => !q.options.includes(a)) ||
        (q.type === "single_choice" && q.correctAnswers.length !== 1)
      )
        problems.push(
          `Question ${q.id}: independently verified answers, explanation and evidence required.`,
        );
      if (q.originalId) {
        const o = originalMap.get(q.originalId);
        if (
          !o ||
          o.label !== q.label ||
          o.description !== q.description ||
          o.type !== q.type ||
          studyValue(o.options) !== studyValue(q.options) ||
          !o.attribution.trim() ||
          !o.locator.trim()
        )
          problems.push(
            `Original question ${q.originalId}: wording, options and attribution must match the retrieved source.`,
          );
        used.push(q.originalId);
      }
    }
  }
  const sourceOrder = originals
    .sort((a, b) => a.order - b.order)
    .map((q) => q.id);
  if (studyValue(used) !== studyValue(sourceOrder))
    problems.push(
      "Preserve every original question exactly once in source order across checkpoints.",
    );
  if (
    checkpoints.some(
      (cp, i) =>
        i > 0 &&
        blocks.findIndex((b) => b.id === cp.afterBlockId) <
          blocks.findIndex((b) => b.id === checkpoints[i - 1].afterBlockId),
    )
  )
    problems.push("Checkpoints must follow teaching sections in source order.");
  if (new Set(checkpoints.map((c) => c.order)).size !== checkpoints.length)
    problems.push("Checkpoint order must be unique.");
  const courseId = job.resolvedCourseId ?? job.request.courseId;
  const course = courseId
    ? await ctx.db.get("learnCollections", courseId)
    : null;
  if (
    courseId &&
    (!course ||
      course.ownerId !== ownerId ||
      course.archived ||
      course.revision !== job.courseRevision ||
      studyValue([course.lessonIds ?? [], course.modules ?? []]) !==
        job.courseStructure)
  )
    problems.push(
      "Course changed or is unavailable; read get_course and refresh_study_lesson_placement before retrying.",
    );
  if (problems.length) {
    await ctx.db.patch("studyLessonJobs", job._id, {
      state: "validation_failed",
      problems: problems.slice(0, 100),
      revision: job.revision + 1,
      updatedAt: Date.now(),
    });
    return result((await ctx.db.get("studyLessonJobs", job._id))!);
  }
  for (const b of blocks)
    for (const c of b.citations) {
      await accessibleStudySource(ctx, ownerId, c.sourceId);
    }
  for (const cp of checkpoints)
    for (const q of cp.questions)
      for (const c of q.evidence)
        await accessibleStudySource(ctx, ownerId, c.sourceId);
  const deck = decks[0];
  let setId = deck.existingSetId;
  if (setId) {
    const existing = await ctx.db.get("flashcardSets", setId);
    if (
      !existing ||
      existing.ownerId !== ownerId ||
      existing.archived ||
      studyValue(existing.cards.map(({ id: _id, ...card }) => card)) !==
        studyValue(deck.cards.map(({ id: _id, ...card }) => card))
    )
      fail(
        "Reused flashcard deck must be owned, active and exactly match submitted cards.",
      );
  } else {
    // Best-effort reuse over the most recent decks; a larger library still gets a new deck.
    const candidates = await ctx.db
      .query("flashcardSets")
      .withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(100);
    const existing = candidates.find(
      (c) =>
        !c.archived &&
        studyValue(c.cards.map(({ id: _id, ...card }) => card)) ===
          studyValue(deck.cards.map(({ id: _id, ...card }) => card)),
    );
    if (existing) setId = existing._id;
    else
      setId = await createFlashcardSet(ctx, ownerId, {
        title: reviews[0].metadata.title,
        cards: deck.cards,
      });
  }
  const assetIds: string[] = [setId];
  const reusableForms = await ctx.db
    .query("forms")
    .withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", ownerId))
    .order("desc")
    .take(100);
  const questionSignature = (qs: import("./mcpContract").McpQuestion[]) =>
    studyValue(
      qs.map((q) => [
        q.label,
        q.description,
        q.options,
        q.correctAnswers,
        q.explanation,
      ]),
    );
  for (const cp of checkpoints) {
    const questions = cp.questions.map((q) => ({
      id: q.id,
      type: q.type,
      label: q.label,
      options: q.options,
      correctAnswers: q.correctAnswers,
      explanation: q.explanation,
      required: true,
      points: 1,
      description: [
        q.description,
        q.originalId
          ? `${originalMap.get(q.originalId)!.attribution} · ${originalMap.get(q.originalId)!.locator}`
          : "Supplementary question",
      ]
        .filter(Boolean)
        .join("\n\n"),
    }));
    const parsed = parseFormInput({
      title: cp.title,
      quizMode: true,
      questions,
      sound: job.profile.sound,
    });
    if ("errors" in parsed) fail(parsed.errors.join("; "));
    const definition = toDefinition(parsed.input);
    for (const [i, field] of definition.fields.entries()) {
      field.label = questions[i].label;
      field.description = questions[i].description;
      if (field.options)
        for (const [j, option] of field.options.entries())
          option.label = questions[i].options[j];
    }
    if (job.profile.themeDesign)
      definition.theme = {
        ...job.profile.themeDesign,
        sound: job.profile.sound ?? "off",
      };
    definition.defaultLanguage = job.profile.language?.startsWith("ar")
      ? "ar"
      : "en";
    if (checkDefinition(definition).errors.length > 0)
      fail(`Checkpoint ${cp.title} is not a valid quiz.`);
    let formId = cp.existingFormId;
    if (!formId)
      formId = reusableForms.find(
        (f) =>
          !f.isBanned &&
          f.status !== "archived" &&
          f.draft.quiz?.enabled &&
          questionSignature(fromDefinition(f.draft).questions) ===
            questionSignature(questions),
      )?._id;
    if (formId) {
      const f = await ctx.db.get("forms", formId);
      if (!f || f.ownerId !== ownerId || f.isBanned || !f.draft.quiz?.enabled)
        fail("Reused quiz must be an owned quiz form.");
      const actual = fromDefinition(f.draft).questions;
      if (
        studyValue(
          actual.map((q) => [
            q.label,
            q.description,
            q.options,
            q.correctAnswers,
            q.explanation,
          ]),
        ) !==
        studyValue(
          questions.map((q) => [
            q.label,
            q.description,
            q.options,
            q.correctAnswers,
            q.explanation,
          ]),
        )
      )
        fail("Reused quiz does not match independently verified questions.");
    } else {
      formId = await createFormRecord(ctx, ownerId, definition);
      reusableForms.push((await ctx.db.get("forms", formId))!);
    }
    assetIds.push(formId);
    const index = blocks.findIndex((b) => b.id === cp.afterBlockId);
    // A stable ID and a native quiz reference render through the existing inline quiz component.
    const existingAtAnchor = checkpoints.filter(
      (other) =>
        other.afterBlockId === cp.afterBlockId && other.order < cp.order,
    ).length;
    blocks.splice(index + 1 + existingAtAnchor, 0, {
      id: `checkpoint_${cp.order}`,
      type: "quiz",
      citations: [],
      conceptIds: [],
      asset: { kind: "form", id: formId },
    });
  }
  blocks.push({
    id: "study_flashcards",
    type: "flashcards",
    citations: [],
    conceptIds: [],
    setId,
  });
  assertDocument({ schemaVersion: 1, blocks });
  const lessonId = await createLessonForActor(ctx, ownerId, {
    metadata: reviews[0].metadata,
    document: { schemaVersion: 1, blocks },
  });
  for (let i = 0; i < checkpoints.length; i++)
    await attachAssessmentForActor(ctx, ownerId, {
      lessonId,
      asset: { kind: "form", id: assetIds[i + 1] as Id<"forms"> },
      label: checkpoints[i].title,
      order: checkpoints[i].order,
    });
  for (const g of of("glossary"))
    await saveGlossaryForActor(ctx, ownerId, lessonId, { entries: g.entries });
  if (course && courseId) {
    const ids = [...(course.lessonIds ?? [])];
    const courseModule = (course.modules ?? []).find(
      (m) => m.id === (job.resolvedModuleId ?? job.request.moduleId),
    );
    const anchor = job.request.afterLessonId ?? courseModule?.lessonIds.at(-1);
    const nextModule = courseModule
      ? (course.modules ?? [])
          .slice(
            (course.modules ?? []).findIndex((m) => m.id === courseModule.id) +
              1,
          )
          .find((m) => m.lessonIds.length)
      : null;
    const insertion = anchor
      ? ids.indexOf(anchor) + 1
      : nextModule
        ? ids.indexOf(nextModule.lessonIds[0])
        : ids.length;
    ids.splice(insertion, 0, lessonId);
    await setOutlineCourse(ctx, { courseId, lessonIds: ids }, ownerId);
    if (courseModule)
      await setCourseModules(
        ctx,
        {
          courseId,
          modules: (course.modules ?? []).map((m) =>
            m.id === courseModule.id
              ? {
                  ...m,
                  lessonIds: ids.filter(
                    (id) => id === lessonId || m.lessonIds.includes(id),
                  ),
                }
              : m,
          ),
        },
        ownerId,
      );
  }
  await ctx.db.patch("studyLessonJobs", job._id, {
    lessonId,
    assetIds,
    counts: {
      sections: sections.length,
      questions: checkpoints.reduce((n, c) => n + c.questions.length, 0),
      cards: deck.cards.length,
      glossaryTerms: new Set(
        of("glossary").flatMap((g) =>
          g.entries.map((e) => e.term.trim().toLocaleLowerCase()),
        ),
      ).size,
      media: blocks.filter((b) =>
        ["image", "youtube", "diagram"].includes(b.type),
      ).length,
      sources: readings.length,
    },
    stage: "draft_saved",
    state: "draft",
    problems: reviews[0].warnings,
    revision: job.revision + 1,
    updatedAt: Date.now(),
  });
  return result((await ctx.db.get("studyLessonJobs", job._id))!);
}
const finalizeArgs = v.object(edit);

export async function publishStudyLesson(
  ctx: MutationCtx,
  ownerId: string,
  args: Infer<typeof finalizeArgs>,
) {
  const job = await owned(ctx, ownerId, args.jobId);
  if (job.state === "published") return result(job);
  revision(job.revision, args.expectedRevision);
  if (!job.lessonId) fail("Finalize teaching content first.");
  const lesson = await ctx.db.get("lessons", job.lessonId);
  if (!lesson || lesson.ownerId !== ownerId || lesson.status !== "active")
    fail("Lesson unavailable.");
  const courseId = job.resolvedCourseId ?? job.request.courseId;
  if (courseId) {
    const c = await ctx.db.get("learnCollections", courseId);
    if (
      !c ||
      c.ownerId !== ownerId ||
      c.archived ||
      !(c.lessonIds ?? []).includes(job.lessonId)
    )
      fail("Course no longer contains this lesson.");
    for (const id of c.lessonIds ?? [])
      if (id !== job.lessonId) {
        const other = await ctx.db.get("lessons", id);
        const version = other?.publishedVersionId
          ? await ctx.db.get("lessonVersions", other.publishedVersionId)
          : null;
        if (
          !other ||
          !version ||
          studyValue(other.draft) !== studyValue(version.document) ||
          studyValue(other.metadata) !== studyValue(version.metadata)
        )
          fail(
            "Review and publish other course drafts separately before publishing this study job.",
          );
      }
  }
  const preflight = (await publicationProblems(ctx, lesson)).filter(
    (p) => p.code !== "QUIZ" && p.code !== "FLASHCARDS",
  );
  if (preflight.length) {
    await ctx.db.patch("studyLessonJobs", job._id, {
      state: "validation_failed",
      problems: preflight.map((p) => `${p.path}: ${p.message}`),
      revision: job.revision + 1,
      updatedAt: Date.now(),
    });
    return result((await ctx.db.get("studyLessonJobs", job._id))!);
  }
  // Publication is an explicit tool call; the client checks configured/user authorization.
  for (const assetId of job.assetIds.slice(1)) {
    const formId = ctx.db.normalizeId("forms", assetId)!;
    const form = await ctx.db.get("forms", formId);
    if (
      !form ||
      form.ownerId !== ownerId ||
      form.isBanned ||
      !form.draft.quiz?.enabled ||
      form.draft.fields.some((f) => !f.quiz?.explanation?.trim()) ||
      checkDefinition(form.draft).errors.length > 0
    )
      fail("Checkpoint quiz is unavailable or invalid.");
    if (!form.publishedVersion || form.publishedRevision !== form.draftRevision)
      await publishNow(ctx, form, ownerId);
  }
  const setId = ctx.db.normalizeId("flashcardSets", job.assetIds[0])!;
  const deck = await ctx.db.get("flashcardSets", setId);
  if (!deck || deck.ownerId !== ownerId || deck.archived)
    fail("Flashcard deck unavailable.");
  const publishedDeck = deck.publishedVersionId
    ? await ctx.db.get("flashcardVersions", deck.publishedVersionId)
    : null;
  const versionId =
    deck.publishedVersionId &&
    deck.visibility === "public" &&
    publishedDeck &&
    studyValue(publishedDeck.cards) === studyValue(deck.cards)
      ? deck.publishedVersionId
      : await publishFlashcardSet(ctx, ownerId, {
          setId,
          expectedRevision: deck.revision,
          visibility: "public",
        });
  await attachFlashcardsForActor(ctx, ownerId, {
    lessonId: job.lessonId,
    versionId,
    label: deck.title,
    order: 0,
  });
  const problems = await publicationProblems(ctx, lesson);
  if (problems.length) {
    await ctx.db.patch("studyLessonJobs", job._id, {
      state: "validation_failed",
      problems: problems.map((p) => `${p.path}: ${p.message}`),
      revision: job.revision + 1,
      updatedAt: Date.now(),
    });
    return result((await ctx.db.get("studyLessonJobs", job._id))!);
  }
  const publication = courseId
    ? await publishCourse(
        ctx,
        {
          courseId,
          visibility: job.profile.visibility ?? "public",
          teamId: job.profile.teamId,
        },
        ownerId,
      )
    : await publishLessonForActor(ctx, ownerId, {
        lessonId: job.lessonId,
        expectedRevision: lesson.revision,
        visibility: job.profile.visibility ?? "public",
        teamId: job.profile.teamId,
      });
  await ctx.db.patch("studyLessonJobs", job._id, {
    stage: publication.ok ? "complete" : "publication",
    state: publication.ok ? "published" : "validation_failed",
    problems: publication.ok ? [] : publication.problems.map((p) => p.message),
    revision: job.revision + 1,
    updatedAt: Date.now(),
  });
  return result((await ctx.db.get("studyLessonJobs", job._id))!);
}
export async function saveTeachingProfile(
  ctx: MutationCtx,
  ownerId: string,
  args: {
    courseId?: Id<"learnCollections">;
    profile: Infer<typeof teachingProfile>;
  },
) {
  bounded(args.profile, 8000);
  if (args.profile.theme && !args.profile.themeDesign)
    fail("Resolve the requested Chaos theme first.");
  if (args.courseId) {
    const c = await ctx.db.get("learnCollections", args.courseId);
    if (!c || c.ownerId !== ownerId)
      throw new Error("NOT_FOUND: Owned course required.");
  }
  const scope = args.courseId ?? "default";
  const prior = await ctx.db
    .query("studyTeachingProfiles")
    .withIndex("by_owner_scope", (q) =>
      q.eq("ownerId", ownerId).eq("scope", scope),
    )
    .unique();
  if (prior)
    await ctx.db.patch("studyTeachingProfiles", prior._id, {
      profile: args.profile,
    });
  else
    await ctx.db.insert("studyTeachingProfiles", {
      ownerId,
      scope,
      profile: args.profile,
    });
  return { saved: true };
}
export const start = internalMutation({
  args: { ...actor, request: studyRequest },
  handler: async (ctx, a) =>
    startStudyLesson(ctx, await requireLearnActor(ctx, a.userId), a.request),
});
export const checkpoint = internalMutation({
  args: { ...actor, ...checkpointArgs.fields },
  handler: async (ctx, a) => {
    const { userId, ...input } = a;
    return checkpointStudyLesson(
      ctx,
      await requireLearnActor(ctx, userId),
      input,
    );
  },
});
export const finalize = internalMutation({
  args: { ...actor, ...edit },
  handler: async (ctx, a) =>
    finalizeStudyLesson(ctx, await requireLearnActor(ctx, a.userId), a),
});
export const publish = internalMutation({
  args: { ...actor, ...edit },
  handler: async (ctx, a) =>
    publishStudyLesson(ctx, await requireLearnActor(ctx, a.userId), a),
});
export const status = internalQuery({
  args: { ...actor, ...base },
  handler: async (ctx, a) => {
    const job = await owned(
      ctx,
      await requireLearnActor(ctx, a.userId),
      a.jobId,
    );
    return {
      ...result(job),
      checkpoints: (await parts(ctx, job._id)).map((p) => ({
        key: p.key,
        kind: p.value.kind,
      })),
    };
  },
});
export const readPart = internalQuery({
  args: { ...actor, ...base, key: v.string() },
  handler: async (ctx, a) => {
    await owned(ctx, await requireLearnActor(ctx, a.userId), a.jobId);
    return {
      value:
        (
          await ctx.db
            .query("studyLessonParts")
            .withIndex("by_job_key", (q) =>
              q.eq("jobId", a.jobId).eq("key", a.key),
            )
            .unique()
        )?.value ?? null,
    };
  },
});
export const profile = internalMutation({
  args: {
    ...actor,
    courseId: v.optional(v.id("learnCollections")),
    profile: teachingProfile,
  },
  handler: async (ctx, a) =>
    saveTeachingProfile(ctx, await requireLearnActor(ctx, a.userId), a),
});
// The Chaos UI uses the same service and native identity, never a separate generator.
export const build = mutation({
  args: { request: studyRequest },
  handler: async (ctx, a) =>
    startStudyLesson(
      ctx,
      (await requireActiveUser(ctx)).identity.subject,
      a.request,
    ),
});
export const saveCheckpoint = mutation({
  args: checkpointArgs.fields,
  handler: async (ctx, a) =>
    checkpointStudyLesson(
      ctx,
      (await requireActiveUser(ctx)).identity.subject,
      a,
    ),
});
export const finish = mutation({
  args: edit,
  handler: async (ctx, a) =>
    finalizeStudyLesson(
      ctx,
      (await requireActiveUser(ctx)).identity.subject,
      a,
    ),
});
export const publishJob = mutation({
  args: edit,
  handler: async (ctx, a) =>
    publishStudyLesson(ctx, (await requireActiveUser(ctx)).identity.subject, a),
});
export const get = query({
  args: base,
  handler: async (ctx, a) =>
    result(
      await owned(
        ctx,
        (await requireActiveUser(ctx)).identity.subject,
        a.jobId,
      ),
    ),
});

export const listJobs = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = (await requireActiveUser(ctx)).identity.subject;
    const rows = await ctx.db
      .query("studyLessonJobs")
      .withIndex("by_owner_updated", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(30);
    return rows.map(result);
  },
});

const placementArgs = {
  jobId: v.id("studyLessonJobs"),
  expectedRevision: v.number(),
  courseRevision: v.number(),
  lessonIds: v.array(v.id("lessons")),
  modules: v.array(courseModule),
};
export async function refreshStudyPlacement(
  ctx: MutationCtx,
  ownerId: string,
  a: Infer<typeof placementValidator>,
) {
  const job = await owned(ctx, ownerId, a.jobId);
  if (job.lessonId)
    fail(
      "A finalized lesson must be moved through the existing course editor.",
    );
  const courseId = job.resolvedCourseId ?? job.request.courseId;
  const course = courseId
    ? await ctx.db.get("learnCollections", courseId)
    : null;
  if (
    !course ||
    course.ownerId !== ownerId ||
    course.archived ||
    course.communityState !== "ok"
  )
    fail("Active owned course required.");
  const structure = studyValue([course.lessonIds ?? [], course.modules ?? []]);
  if (
    course.revision !== a.courseRevision ||
    structure !== studyValue([a.lessonIds, a.modules])
  )
    fail(
      "Course changed since your read. Reload get_course before refreshing placement.",
    );
  if (
    job.courseStructure === structure &&
    job.courseRevision === course.revision
  )
    return result(job);
  revision(job.revision, a.expectedRevision);
  const moduleId = job.resolvedModuleId ?? job.request.moduleId;
  const moduleItem = (course.modules ?? []).find((m) => m.id === moduleId);
  if (moduleId && !moduleItem)
    fail(
      "Selected module no longer exists; choose its replacement before creating another job.",
    );
  if (
    job.request.afterLessonId &&
    (!(course.lessonIds ?? []).includes(job.request.afterLessonId) ||
      (moduleItem && !moduleItem.lessonIds.includes(job.request.afterLessonId)))
  )
    fail("Selected placement anchor is no longer in the course/module.");
  await ctx.db.patch("studyLessonJobs", job._id, {
    courseRevision: course.revision,
    courseStructure: structure,
    state: "collecting",
    problems: [],
    revision: job.revision + 1,
    updatedAt: Date.now(),
  });
  return result((await ctx.db.get("studyLessonJobs", job._id))!);
}
const placementValidator = v.object(placementArgs);
export const refreshPlacement = internalMutation({
  args: { userId: v.string(), ...placementArgs },
  handler: async (ctx, a) =>
    refreshStudyPlacement(ctx, await requireLearnActor(ctx, a.userId), a),
});
export const refreshCourse = mutation({
  args: placementArgs,
  handler: async (ctx, a) =>
    refreshStudyPlacement(
      ctx,
      (await requireActiveUser(ctx)).identity.subject,
      a,
    ),
});
