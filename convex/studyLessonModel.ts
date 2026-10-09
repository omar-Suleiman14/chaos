import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";
import {
  lessonBlock,
  lessonMeta,
  citation,
  visibility,
  sourceMetadata,
} from "./learnModel";
import { cards } from "./learnAssetModel";
import { themeValidator } from "./formModel";
import { glossaryEntry } from "./lessonGlossaryModel";

export const teachingProfile = v.object({
  teamId: v.optional(v.id("businessTeams")),
  language: v.optional(v.string()),
  lookupLanguage: v.optional(v.string()),
  style: v.optional(v.string()),
  level: v.optional(v.string()),
  theme: v.optional(v.string()),
  themeDesign: v.optional(themeValidator),
  sound: v.optional(
    v.union(
      v.literal("soft"),
      v.literal("pop"),
      v.literal("wood"),
      v.literal("arcade"),
      v.literal("off"),
    ),
  ),
  publish: v.optional(v.boolean()),
  visibility: v.optional(visibility),
});
export const studyRequest = v.object({
  key: v.string(),
  title: v.string(),
  sources: v.array(
    v.object({
      sourceId: v.optional(v.id("learnSources")),
      reference: v.optional(v.string()),
      label: v.string(),
    }),
  ),
  courseId: v.optional(v.id("learnCollections")),
  courseTitle: v.optional(v.string()),
  moduleId: v.optional(v.string()),
  moduleTitle: v.optional(v.string()),
  afterLessonId: v.optional(v.id("lessons")),
  quizSource: v.optional(v.string()),
  preferences: v.optional(teachingProfile),
});
const originalQuestion = v.object({
  id: v.string(),
  order: v.number(),
  label: v.string(),
  description: v.optional(v.string()),
  options: v.array(v.string()),
  type: v.union(v.literal("single_choice"), v.literal("multiple_choice")),
  attribution: v.string(),
  locator: v.string(),
});
const answer = v.object({
  id: v.string(),
  label: v.string(),
  description: v.optional(v.string()),
  options: v.array(v.string()),
  type: v.union(v.literal("single_choice"), v.literal("multiple_choice")),
  correctAnswers: v.array(v.string()),
  explanation: v.string(),
  evidence: v.array(citation),
  originalId: v.optional(v.string()),
});
export const studyPart = v.union(
  v.object({
    kind: v.literal("reading"),
    sourceIndex: v.number(),
    sourceId: v.id("learnSources"),
    totalUnits: v.number(),
    readUnits: v.array(v.number()),
    visualUnits: v.array(v.number()),
    inspectedVisualUnits: v.array(v.number()),
    concepts: v.array(v.string()),
    notes: v.string(),
  }),
  v.object({
    kind: v.literal("question_source"),
    source: v.string(),
    topic: v.string(),
    questions: v.array(originalQuestion),
  }),
  v.object({
    kind: v.literal("section"),
    order: v.number(),
    blocks: v.array(lessonBlock),
    concepts: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("checkpoint"),
    order: v.number(),
    afterBlockId: v.string(),
    title: v.string(),
    questions: v.array(answer),
    existingFormId: v.optional(v.id("forms")),
  }),
  v.object({
    kind: v.literal("flashcards"),
    cards,
    existingSetId: v.optional(v.id("flashcardSets")),
  }),
  v.object({ kind: v.literal("glossary"), entries: v.array(glossaryEntry) }),
  v.object({
    kind: v.literal("review"),
    metadata: lessonMeta,
    coveredConcepts: v.array(v.string()),
    verifiedMediaBlockIds: v.array(v.string()),
    warnings: v.array(v.string()),
  }),
);
export type StudyPart = Infer<typeof studyPart>;
export const studyTables = {
  studySourceUploads: defineTable({
    ownerId: v.string(),
    key: v.string(),
    metadata: sourceMetadata,
    contentType: v.string(),
    totalChunks: v.number(),
    bytes: v.number(),
    sourceId: v.optional(v.id("learnSources")),
    expiresAt: v.number(),
  }).index("by_owner_key", ["ownerId", "key"]),
  studySourceChunks: defineTable({
    uploadId: v.id("studySourceUploads"),
    index: v.number(),
    data: v.string(),
  }).index("by_upload_index", ["uploadId", "index"]),
  studyLessonJobs: defineTable({
    ownerId: v.string(),
    key: v.string(),
    identity: v.string(),
    request: studyRequest,
    profile: teachingProfile,
    state: v.union(
      v.literal("collecting"),
      v.literal("draft"),
      v.literal("validation_failed"),
      v.literal("published"),
    ),
    revision: v.number(),
    checkpointBytes: v.number(),
    courseRevision: v.optional(v.number()),
    courseStructure: v.optional(v.string()),
    resolvedCourseId: v.optional(v.id("learnCollections")),
    resolvedModuleId: v.optional(v.string()),
    lessonId: v.optional(v.id("lessons")),
    stage: v.optional(v.string()),
    partCount: v.number(),
    counts: v.optional(
      v.object({
        sections: v.number(),
        questions: v.number(),
        cards: v.number(),
        glossaryTerms: v.number(),
        media: v.number(),
        sources: v.number(),
      }),
    ),
    assetIds: v.array(v.string()),
    problems: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_key", ["ownerId", "key"])
    .index("by_owner_updated", ["ownerId", "updatedAt"])
    .index("by_owner_identity", ["ownerId", "identity"]),
  studyLessonParts: defineTable({
    jobId: v.id("studyLessonJobs"),
    key: v.string(),
    value: studyPart,
  }).index("by_job_key", ["jobId", "key"]),
  studyTeachingProfiles: defineTable({
    ownerId: v.string(),
    scope: v.string(),
    profile: teachingProfile,
  }).index("by_owner_scope", ["ownerId", "scope"]),
};
