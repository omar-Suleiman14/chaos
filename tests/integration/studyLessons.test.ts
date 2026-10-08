import { expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { StudyPart } from "@/convex/studyLessonModel";
import { createTestConvex } from "./setup";
const userId = "study_owner",
  other = "study_other";
const m = (name: string) =>
  makeFunctionReference<"mutation">(`studyLessons:${name}`);
const q = (name: string) =>
  makeFunctionReference<"query">(`studyLessons:${name}`);
async function setup(course = false, uploaded = false) {
  const t = createTestConvex();
  await t.run(async (ctx) => {
    for (const clerkId of [userId, other])
      await ctx.db.insert("users", {
        clerkId,
        username: clerkId,
        name: clerkId,
        email: `${clerkId}@example.com`,
        createdAt: 0,
        plan: "pro",
      });
  });
  const { sourceId } = uploaded
    ? await t.action(
        makeFunctionReference<"action">("studySourceUploads:upload"),
        {
          userId,
          key: "e2e-lecture-file",
          index: 0,
          totalChunks: 1,
          data: btoa(
            "Definition: diffusion is net movement down a concentration gradient.\nMechanism: random movement occurs in both directions, with a net flux from high to low concentration until equilibrium.",
          ),
          contentType: "text/plain",
          metadata: {
            title: "Lecture",
            kind: "file",
            origin: "Explicit test-client upload",
          },
        },
      )
    : await t.mutation(
        makeFunctionReference<"mutation">("studySourceUploads:reference"),
        {
          userId,
          metadata: {
            title: "Lecture",
            kind: "reference",
            origin: "Provided lecture",
          },
          metadataVisibility: "public",
        },
      );
  const courseId = course
    ? (
        await t.mutation(
          makeFunctionReference<"mutation">("mcpCourses:create"),
          { userId, title: "Biology" },
        )
      ).courseId
    : undefined;
  const request = {
    key: "lecture-8",
    title: "Lecture 8",
    sources: [{ sourceId, label: "Lecture" }],
    ...(courseId ? { courseId } : {}),
    preferences: {
      language: "en",
      lookupLanguage: "ar",
      publish: true,
      visibility: "public" as const,
    },
  };
  let job = await t.mutation(m("start"), { userId, request });
  const save = async (key: string, value: StudyPart) => {
    job = await t.mutation(m("checkpoint"), {
      userId,
      jobId: job.jobId,
      expectedRevision: job.revision,
      key,
      value,
    });
    return job;
  };
  const citation = {
    sourceId,
    locator: { kind: "section" as const, label: "Diffusion" },
  };
  const deck: StudyPart = {
    kind: "flashcards",
    cards: [
      {
        id: "diffusion",
        front: "What drives net diffusion?",
        back: "A concentration gradient.",
        conceptIds: ["diffusion"],
      },
    ],
  };
  const reading: StudyPart = {
    kind: "reading",
    sourceIndex: 0,
    sourceId,
    totalUnits: 2,
    readUnits: [1, 2],
    visualUnits: uploaded ? [] : [2],
    inspectedVisualUnits: uploaded ? [] : [2],
    concepts: ["diffusion"],
    notes: "All source sections and figure inspected by client.",
  };
  const review: StudyPart = {
    kind: "review",
    metadata: {
      title: "Lecture 8",
      description: "Diffusion mechanism",
      language: "en",
      tags: ["biology"],
    },
    coveredConcepts: ["diffusion"],
    verifiedMediaBlockIds: [],
    warnings: [],
  };
  const checkpoint: StudyPart = {
    kind: "checkpoint",
    order: 0,
    title: "Diffusion checkpoint",
    afterBlockId: "teach",
    questions: [
      {
        id: "question1",
        label: "What drives net diffusion?",
        description:
          "A dye is introduced on one side of a still beaker of water. The dye concentration initially differs across the beaker.",
        options: ["A concentration gradient", "Gravity alone"],
        type: "single_choice",
        correctAnswers: ["A concentration gradient"],
        explanation:
          "Random motion produces net movement down a concentration gradient; gravity alone does not explain diffusion.",
        evidence: [citation],
        originalId: "original1",
      },
    ],
  };
  const fill = async () => {
    await save("reading", reading);
    await save("teaching", {
      kind: "section",
      order: 0,
      concepts: ["diffusion"],
      blocks: [
        {
          id: "teach",
          type: "paragraph",
          text: "Particles move randomly in both directions. A concentration gradient creates a net flux from higher to lower concentration until equilibrium; random molecular motion continues at equilibrium.",
          citations: [citation],
          conceptIds: [],
        },
      ],
    });
    await save("source-questions", {
      kind: "question_source",
      source: "User question bank",
      topic: "Lecture 8 — diffusion",
      questions: [
        {
          id: "original1",
          order: 1,
          label: "What drives net diffusion?",
          description:
            "A dye is introduced on one side of a still beaker of water. The dye concentration initially differs across the beaker.",
          options: ["A concentration gradient", "Gravity alone"],
          type: "single_choice",
          attribution: "User-provided bank",
          locator: "Question 1",
        },
      ],
    });
    await save("checkpoint", checkpoint);
    await save("cards", deck);
    await save("glossary", {
      kind: "glossary",
      entries: [
        {
          term: "diffusion",
          definition: "Net movement down a concentration gradient.",
          translation: "الانتشار",
          language: "ar",
        },
      ],
    });
    await save("review", review);
  };
  return {
    t,
    sourceId,
    request,
    save,
    fill,
    deck,
    reading,
    review,
    checkpoint,
    get job() {
      return job;
    },
    set job(j) {
      job = j;
    },
    courseId,
  };
}
it("completes the native lesson/quiz/card/glossary workflow, grades answers and persists card reviews without duplication", async () => {
  const s = await setup(true, true);
  await s.fill();
  const args = { userId, jobId: s.job.jobId, expectedRevision: s.job.revision };
  const draft = await s.t.mutation(m("finalize"), args);
  expect(draft).toMatchObject({
    status: "draft",
    summary: { assets: 2, checkpoints: 1, flashcardSets: 1 },
  });
  expect(await s.t.mutation(m("finalize"), args)).toEqual(draft);
  await s.t.mutation(
    makeFunctionReference<"mutation">("studySourceUploads:publishSource"),
    { userId, sourceId: s.sourceId },
  );
  expect(
    (await s.t.run((ctx) => ctx.db.get("learnSources", s.sourceId)))!
      .contentVisibility,
  ).toBe("private");
  const published = await s.t.mutation(m("publish"), {
    userId,
    jobId: draft.jobId,
    expectedRevision: draft.revision,
  });
  expect(published.status).toBe("published");
  expect(
    await s.t.mutation(m("publish"), {
      userId,
      jobId: draft.jobId,
      expectedRevision: draft.revision,
    }),
  ).toEqual(published);
  expect(
    (await s.t.mutation(m("start"), { userId, request: s.request })).lessonId,
  ).toBe(draft.lessonId);
  const lesson = await s.t.run((ctx) => ctx.db.get("lessons", draft.lessonId));
  expect(lesson!.draft.blocks.map((b) => b.type)).toEqual([
    "paragraph",
    "quiz",
    "flashcards",
  ]);
  const embed = await s.t.query(api.learnFrontend.embeddedQuiz, {
    asset: { kind: "form", id: draft.assets[1] },
  });
  expect(embed).toMatchObject({ questionCount: 1 });
  expect(
    await s.t.query(api.learnFrontend.embeddedFlashcards, {
      setId: draft.assets[0],
    }),
  ).toMatchObject({ cardCount: 1 });
  const form = await s.t.run((ctx) => ctx.db.get("forms", draft.assets[1]));
  const field = form!.draft.fields[0];
  expect(field.description).toContain(
    "A dye is introduced on one side of a still beaker",
  );
  const response = await s.t.mutation(api.respond.submitResponse, {
    shareId: embed!.shareId!,
    submissionKey: "study-e2e-answer-001",
    answers: { [field.id]: field.quiz!.correctOptionIds[0] },
    language: "en",
    final: true,
    startedAt: Date.now() - 1000,
  });
  expect(response.quizScore).toBe(1);
  expect(response.quizReview?.[0].explanation).toContain(
    "concentration gradient",
  );
  expect(response.quizReview?.[0].correctOptionIds).toEqual(
    field.quiz!.correctOptionIds,
  );
  const deck = await s.t.run((ctx) =>
    ctx.db.get("flashcardSets", draft.assets[0]),
  );
  const learner = s.t.withIdentity({
    subject: other,
    issuer: "https://test.chaos.fail",
    tokenIdentifier: `https://test.chaos.fail|${other}`,
  });
  const rating = await learner.mutation(
    makeFunctionReference<"mutation">("flashcardStudy:review"),
    {
      versionId: deck!.publishedVersionId!,
      cardId: "diffusion",
      rating: "good",
      eventId: "study-card-event-001",
      expectedRevision: 0,
    },
  );
  expect(rating.revision).toBe(1);
  expect(
    await s.t.run((ctx) => ctx.db.query("lessonFlashcards").collect()),
  ).toHaveLength(1);
  expect(
    await s.t.run((ctx) => ctx.db.query("lessonAssessments").collect()),
  ).toHaveLength(1);
  expect(
    await s.t.run((ctx) => ctx.db.query("lessonGlossaries").collect()),
  ).toHaveLength(1);
  expect(
    (await s.t.run((ctx) => ctx.db.get("learnCollections", s.courseId!)))!
      .lessonIds,
  ).toEqual([draft.lessonId]);
  expect(
    await s.t.run((ctx) => ctx.db.query("lessons").collect()),
  ).toHaveLength(1);
});
it("reports incomplete reading and preserves all checkpoints for repair", async () => {
  const s = await setup();
  await s.fill();
  await s.save("reading", {
    ...s.reading,
    kind: "reading",
    readUnits: [1],
    inspectedVisualUnits: [],
  });
  s.job = await s.t.mutation(m("finalize"), {
    userId,
    jobId: s.job.jobId,
    expectedRevision: s.job.revision,
  });
  expect(s.job.status).toBe("validation_failed");
  expect(s.job.problems.join(" ")).toContain("complete reading");
  expect(
    await s.t.run((ctx) => ctx.db.query("lessons").collect()),
  ).toHaveLength(0);
  await s.save("reading", s.reading);
  expect(
    (
      await s.t.mutation(m("finalize"), {
        userId,
        jobId: s.job.jobId,
        expectedRevision: s.job.revision,
      })
    ).status,
  ).toBe("draft");
});
it("rejects altered originals, missing answer evidence, duplicate cards and incorrect source ordering", async () => {
  const s = await setup();
  await s.fill();
  await s.save("checkpoint", {
    ...s.checkpoint,
    kind: "checkpoint",
    questions: [
      { ...s.checkpoint.questions[0], label: "Changed question", evidence: [] },
    ],
  });
  await s.save("cards", {
    kind: "flashcards",
    cards: [...s.deck.cards, { ...s.deck.cards[0], id: "duplicate" }],
  });
  const failed = await s.t.mutation(m("finalize"), {
    userId,
    jobId: s.job.jobId,
    expectedRevision: s.job.revision,
  });
  expect(failed.problems.join(" ")).toMatch(/wording/);
  expect(failed.problems.join(" ")).toMatch(/evidence/);
  expect(failed.problems.join(" ")).toMatch(/duplicate flashcard/);
  expect(await s.t.run((ctx) => ctx.db.query("forms").collect())).toHaveLength(
    0,
  );
});
it("is revision safe, isolates users, detects changed requests and reuses equivalent work", async () => {
  const s = await setup();
  const args = {
    userId,
    jobId: s.job.jobId,
    expectedRevision: 0,
    key: "reading",
    value: s.reading,
  };
  const first = await s.t.mutation(m("checkpoint"), args);
  expect(await s.t.mutation(m("checkpoint"), args)).toEqual(first);
  await expect(
    s.t.mutation(m("checkpoint"), {
      ...args,
      value: { ...s.reading, notes: "changed" },
    }),
  ).rejects.toThrow("REVISION_CONFLICT");
  await expect(
    s.t.query(q("status"), { userId: other, jobId: s.job.jobId }),
  ).rejects.toThrow("NOT_FOUND");
  await expect(
    s.t.mutation(m("start"), {
      userId,
      request: { ...s.request, title: "Different" },
    }),
  ).rejects.toThrow("different request");
  expect(
    (
      await s.t.mutation(m("start"), {
        userId,
        request: { ...s.request, key: "other-key" },
      })
    ).jobId,
  ).toBe(s.job.jobId);
});
it("checks course outline changes and source sharing before creating or publishing assets", async () => {
  const s = await setup(true);
  await s.fill();
  await s.t.mutation(
    makeFunctionReference<"mutation">("mcpCourses:addLesson"),
    { userId, courseId: s.courseId, title: "Unreviewed" },
  );
  const failed = await s.t.mutation(m("finalize"), {
    userId,
    jobId: s.job.jobId,
    expectedRevision: s.job.revision,
  });
  expect(failed.problems.join(" ")).toContain("Course changed");
  const standalone = await setup();
  await standalone.fill();
  const draft = await standalone.t.mutation(m("finalize"), {
    userId,
    jobId: standalone.job.jobId,
    expectedRevision: standalone.job.revision,
  });
  await standalone.t.run((ctx) =>
    ctx.db.patch("learnSources", standalone.sourceId, {
      metadataVisibility: "private",
    }),
  );
  const blocked = await standalone.t.mutation(m("publish"), {
    userId,
    jobId: draft.jobId,
    expectedRevision: draft.revision,
  });
  expect(blocked.status).toBe("validation_failed");
  expect(
    (await standalone.t.run((ctx) => ctx.db.get("forms", draft.assets[1])))!
      .status,
  ).toBe("draft");
  expect(
    (await standalone.t.run((ctx) =>
      ctx.db.get("flashcardSets", draft.assets[0]),
    ))!.publishedVersionId,
  ).toBeUndefined();
});
it("inherits default and course profiles with explicit job overrides", async () => {
  const s = await setup(true);
  await s.t.mutation(m("profile"), {
    userId,
    profile: { language: "ar", sound: "wood", publish: false },
  });
  await s.t.mutation(m("profile"), {
    userId,
    courseId: s.courseId,
    profile: { sound: "off", style: "Explain mechanisms first" },
  });
  const j = await s.t.mutation(m("start"), {
    userId,
    request: {
      ...s.request,
      key: "lecture-9",
      title: "Lecture 9",
      preferences: { language: "en" },
    },
  });
  expect(j.profile).toMatchObject({
    language: "en",
    sound: "off",
    publish: false,
    style: "Explain mechanisms first",
  });
});

it("rolls back failed asset creation, persists an actionable error, and resumes the same checkpoints", async () => {
  const s = await setup();
  await s.fill();
  await s.save("review", {
    ...s.review,
    metadata: { ...s.review.metadata, title: "" },
  });
  await expect(
    s.t.action(makeFunctionReference<"action">("studyLessonJobs:finalize"), {
      userId,
      jobId: s.job.jobId,
      expectedRevision: s.job.revision,
    }),
  ).rejects.toThrow();
  s.job = await s.t.query(q("status"), { userId, jobId: s.job.jobId });
  expect(s.job.status).toBe("validation_failed");
  expect(s.job.problems.length).toBe(1);
  expect(await s.t.run((ctx) => ctx.db.query("forms").collect())).toHaveLength(
    0,
  );
  expect(
    await s.t.run((ctx) => ctx.db.query("flashcardSets").collect()),
  ).toHaveLength(0);
  await s.save("review", s.review);
  expect(
    (
      await s.t.action(
        makeFunctionReference<"action">("studyLessonJobs:finalize"),
        { userId, jobId: s.job.jobId, expectedRevision: s.job.revision },
      )
    ).status,
  ).toBe("draft");
});

it("inserts into an empty earlier module without changing existing lesson or module order", async () => {
  const s = await setup(true);
  const { lessonId } = await s.t.mutation(
    makeFunctionReference<"mutation">("mcpCourses:addLesson"),
    { userId, courseId: s.courseId, title: "Later module lesson" },
  );
  await s.t.mutation(makeFunctionReference<"mutation">("mcpCourses:modules"), {
    userId,
    courseId: s.courseId,
    modules: [
      { id: "early", title: "Early", lessonIds: [], assessments: [] },
      { id: "late", title: "Late", lessonIds: [lessonId], assessments: [] },
    ],
  });
  s.job = await s.t.mutation(m("start"), {
    userId,
    request: {
      ...s.request,
      key: "module-placement",
      title: "Lecture 8",
      moduleTitle: "Early",
    },
  });
  await s.fill();
  const draft = await s.t.mutation(m("finalize"), {
    userId,
    jobId: s.job.jobId,
    expectedRevision: s.job.revision,
  });
  const c = await s.t.run((ctx) => ctx.db.get("learnCollections", s.courseId));
  expect(c!.lessonIds).toEqual([draft.lessonId, lessonId]);
  expect(c!.modules?.map((module) => [module.id, module.lessonIds])).toEqual([
    ["early", [draft.lessonId]],
    ["late", [lessonId]],
  ]);
  await expect(
    s.t.action(makeFunctionReference<"action">("studyLessonJobs:publish"), {
      userId,
      jobId: draft.jobId,
      expectedRevision: draft.revision,
    }),
  ).rejects.toThrow("other course drafts");
});

it("reuses matching decks despite generated card ID differences and matching quiz forms across lessons", async () => {
  const s = await setup();
  await s.fill();
  const first = await s.t.mutation(m("finalize"), {
    userId,
    jobId: s.job.jobId,
    expectedRevision: s.job.revision,
  });
  s.job = await s.t.mutation(m("start"), {
    userId,
    request: { ...s.request, key: "revision-lecture-9", title: "Lecture 9" },
  });
  await s.fill();
  await s.save("cards", {
    ...s.deck,
    cards: s.deck.cards.map((card) => ({
      ...card,
      id: "different-generated-id",
    })),
  });
  const second = await s.t.mutation(m("finalize"), {
    userId,
    jobId: s.job.jobId,
    expectedRevision: s.job.revision,
  });
  expect(second.assets).toEqual(first.assets);
  expect(
    await s.t.run((ctx) => ctx.db.query("flashcardSets").collect()),
  ).toHaveLength(1);
  expect(await s.t.run((ctx) => ctx.db.query("forms").collect())).toHaveLength(
    1,
  );
});

it("refreshes a changed course snapshot without discarding completed teaching work or replacing the outline", async () => {
  const s = await setup(true);
  await s.fill();
  await s.t.mutation(
    makeFunctionReference<"mutation">("mcpCourses:addLesson"),
    { userId, courseId: s.courseId, title: "New existing lesson" },
  );
  s.job = await s.t.mutation(m("finalize"), {
    userId,
    jobId: s.job.jobId,
    expectedRevision: s.job.revision,
  });
  const current = await s.t.run((ctx) =>
    ctx.db.get("learnCollections", s.courseId),
  );
  const input = {
    userId,
    jobId: s.job.jobId,
    expectedRevision: s.job.revision,
    courseRevision: current!.revision,
    lessonIds: current!.lessonIds!,
    modules: current!.modules ?? [],
  };
  s.job = await s.t.mutation(m("refreshPlacement"), input);
  expect(s.job.progress.savedCheckpoints).toBe(7);
  expect(await s.t.mutation(m("refreshPlacement"), input)).toEqual(s.job);
  const draft = await s.t.mutation(m("finalize"), {
    userId,
    jobId: s.job.jobId,
    expectedRevision: s.job.revision,
  });
  expect(draft.status).toBe("draft");
  expect(
    (await s.t.run((ctx) => ctx.db.get("learnCollections", s.courseId)))!
      .lessonIds,
  ).toEqual([...current!.lessonIds!, draft.lessonId]);
});
