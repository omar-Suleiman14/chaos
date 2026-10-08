import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { buildThemePatch } from "./themes";
import { applyThemePatch } from "@/convex/mcpContract";
import { defaultTheme } from "@/convex/formLogic";
import { learnBlockInput, lessonMetadataSchema } from "./learn";
const id = z.string().min(1).max(160);
const text = z.string().trim().min(1);
const profile = z.object({
  teamId: id.optional(),
  language: z.string().max(35).optional(),
  lookupLanguage: z.string().max(35).optional(),
  style: z.string().max(4000).optional(),
  level: z.string().max(200).optional(),
  theme: z.string().max(100).optional(),
  sound: z.enum(["soft", "pop", "wood", "arcade", "off"]).optional(),
  publish: z.boolean().optional(),
  visibility: z.enum(["public", "private", "restricted"]).optional(),
});
const citation = z.object({
  sourceId: id,
  locator: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("page"), page: z.number().int().positive() }),
    z.object({ kind: z.literal("slide"), slide: z.number().int().positive() }),
    z.object({
      kind: z.literal("time"),
      start: z.number().nonnegative(),
      end: z.number().nonnegative().optional(),
    }),
    z.object({ kind: z.literal("section"), label: text.max(300) }),
  ]),
});
const card = z.object({
  id,
  front: text.max(2000),
  back: text.max(4000),
  conceptIds: z.array(id).max(20),
});
const question = z.object({
  id,
  label: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  options: z.array(z.string().min(1).max(500)).min(2).max(100),
  type: z.enum(["single_choice", "multiple_choice"]),
  correctAnswers: z.array(z.string().min(1)).min(1),
  explanation: text.max(2000),
  evidence: z.array(citation).min(1).max(20),
  originalId: id.optional(),
});
const part = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reading"),
    sourceIndex: z.number().int().nonnegative(),
    sourceId: id,
    totalUnits: z.number().int().min(1).max(10000),
    readUnits: z.array(z.number().int().positive()).max(10000),
    visualUnits: z.array(z.number().int().positive()).max(10000),
    inspectedVisualUnits: z.array(z.number().int().positive()).max(10000),
    concepts: z.array(text.max(200)).max(1000),
    notes: z.string().max(10000),
  }),
  z.object({
    kind: z.literal("question_source"),
    source: text.max(2000),
    topic: text.max(500),
    questions: z
      .array(
        z.object({
          id,
          order: z.number().int().nonnegative(),
          label: z.string().min(1).max(500),
          description: z.string().max(5000).optional(),
          options: z.array(z.string().min(1).max(500)).min(2).max(100),
          type: z.enum(["single_choice", "multiple_choice"]),
          attribution: text.max(2000),
          locator: text.max(1000),
        }),
      )
      .max(500),
  }),
  z.object({
    kind: z.literal("section"),
    order: z.number().int(),
    blocks: z.array(learnBlockInput).max(500),
    concepts: z.array(text.max(200)).max(1000),
  }),
  z.object({
    kind: z.literal("checkpoint"),
    order: z.number().int().nonnegative(),
    afterBlockId: id,
    title: text.max(200),
    questions: z.array(question).min(1).max(100),
    existingFormId: id.optional(),
  }),
  z.object({
    kind: z.literal("flashcards"),
    cards: z.array(card).min(1).max(500),
    existingSetId: id.optional(),
  }),
  z.object({
    kind: z.literal("glossary"),
    entries: z
      .array(
        z.object({
          term: text.max(100),
          definition: text.max(1000),
          aliases: z.array(text.max(100)).max(5).optional(),
          translation: text.max(200).optional(),
          explanation: text.max(1500).optional(),
          language: z.string().max(35).optional(),
          pronunciation: text.max(100).optional(),
        }),
      )
      .max(200),
  }),
  z.object({
    kind: z.literal("review"),
    metadata: lessonMetadataSchema,
    coveredConcepts: z.array(text.max(200)).max(1000),
    verifiedMediaBlockIds: z.array(id).max(500),
    warnings: z.array(text.max(2000)).max(100),
  }),
]);
const edit = { jobId: id, expectedRevision: z.number().int().nonnegative() };
const jobOutput = z.looseObject({
  jobId: id,
  revision: z.number().int().nonnegative(),
  status: z.enum(["collecting", "draft", "validation_failed", "published"]),
  lessonId: id.nullable(),
  lessonUrl: z.string().nullable(),
  assets: z.array(id),
  problems: z.array(z.string()),
  profile: z.looseObject({}),
  request: z.looseObject({}),
  nextAction: z.string(),
  summary: z.object({
    assets: z.number(),
    checkpoints: z.number(),
    flashcardSets: z.number(),
    sections: z.number(),
    questions: z.number(),
    cards: z.number(),
    glossaryTerms: z.number(),
    media: z.number(),
    sources: z.number(),
  }),
  progress: z.object({
    stage: z.string(),
    savedCheckpoints: z.number(),
    checkpointBytes: z.number(),
  }),
  resolvedCourseId: id.nullable(),
  resolvedModuleId: id.nullable(),
});
export function registerStudyLessonTools(
  server: McpServer,
  run: (
    tool: string,
    input: Record<string, unknown>,
    summarize: (data: Record<string, unknown>) => string,
  ) => Promise<CallToolResult>,
  securitySchemes: { type: string; scopes: string[] }[],
) {
  const _meta = { securitySchemes },
    write = {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    read = { ...write, readOnlyHint: true };
  const resolveProfile = (p: z.infer<typeof profile> | undefined) =>
    p?.theme
      ? {
          ...p,
          themeDesign: applyThemePatch(
            defaultTheme,
            buildThemePatch({ preset: p.theme }).patch,
            p.sound,
          ),
        }
      : p;
  const summary = (d: Record<string, unknown>) =>
    `Study lesson: ${d.status}. ${d.lessonUrl ?? d.nextAction ?? ""}`;
  server.registerTool(
    "build_study_lesson",
    {
      outputSchema: jobOutput,
      description:
        "Start or resume a durable study lesson job. Use for Study this PDF, teach/explain a lecture, create a tutorial, or do Lecture 8 like previous lessons. The MCP client reads the complete source (including visuals), teaches using the create-study-lesson skill, and saves resumable checkpoints. No server AI extraction is implied. Upload client-local files explicitly using upload_study_source; client upload IDs and local paths are not backend files. Course/module titles resolve only unambiguous existing matches. Draft by default; returned profile may authorize publication. Reuse a stable key for retries.",
      inputSchema: {
        request: z.object({
          key: id.regex(/^[A-Za-z0-9_-]+$/),
          title: text.max(200),
          sources: z
            .array(
              z.object({
                sourceId: id.optional(),
                reference: text.max(4000).optional(),
                label: text.max(200),
              }),
            )
            .min(1)
            .max(50),
          courseId: id.optional(),
          courseTitle: text.max(200).optional(),
          moduleId: id.optional(),
          moduleTitle: text.max(200).optional(),
          afterLessonId: id.optional(),
          quizSource: text.max(2000).optional(),
          preferences: profile.optional(),
        }),
      },
      annotations: write,
      _meta,
    },
    (a) =>
      run(
        "build_study_lesson",
        {
          request: {
            ...a.request,
            ...(a.request.preferences
              ? { preferences: resolveProfile(a.request.preferences) }
              : {}),
          },
        },
        summary,
      ),
  );
  server.registerTool(
    "checkpoint_study_lesson",
    {
      outputSchema: jobOutput,
      description:
        "Save or replace one bounded teaching checkpoint (210 KB maximum). Stable key + identical value is safe to retry, even with an old revision. Otherwise use latest expectedRevision. Reading is a client attestation of complete page/slide/section and visual inspection, never automatic extraction. Section concepts use local descriptive names; block conceptIds must be real Chaos concept IDs or empty. Record original source questions first, then independently solve with citations. Original IDs, wording, options, attribution and order must survive unchanged. Supplementary questions omit originalId. Review records client-verified diagrams/media and warnings. No publication.",
      inputSchema: { ...edit, key: id.max(100), value: part },
      annotations: write,
      _meta,
    },
    (a) => run("checkpoint_study_lesson", a, summary),
  );
  server.registerTool(
    "refresh_study_lesson_placement",
    {
      description:
        "Resume a collecting or failed study job after its course outline/modules changed. Read get_course first and send its current revision, complete ordered lesson IDs and modules. This compares the current structure and updates only the job's placement snapshot; never overwrites the course or discards teaching checkpoints. Selected module/anchor must still exist. Finalized lessons use the native course editor.",
      inputSchema: {
        ...edit,
        courseRevision: z.number().int().nonnegative(),
        lessonIds: z.array(id).max(100),
        modules: z
          .array(
            z.object({
              id,
              title: z.string(),
              lessonIds: z.array(id),
              assessments: z.array(
                z.object({ kind: z.enum(["form", "quiz"]), id }),
              ),
            }),
          )
          .max(100),
      },
      outputSchema: jobOutput,
      annotations: write,
      _meta,
    },
    (a) => run("refresh_study_lesson_placement", a, summary),
  );
  server.registerTool(
    "get_study_lesson_job",
    {
      outputSchema: jobOutput,
      description:
        "Read durable progress, resolved preferences, draft/publication status, warnings, errors, assets and saved checkpoint keys. Resume unfinished work rather than generating duplicates.",
      inputSchema: { jobId: id },
      annotations: read,
      _meta,
    },
    (a) => run("get_study_lesson_job", a, summary),
  );
  server.registerTool(
    "get_study_lesson_checkpoint",
    {
      outputSchema: z.object({
        value: z.record(z.string(), z.unknown()).nullable(),
      }),
      description:
        "Read one owned durable checkpoint by key to resume source reading/teaching or repair validation. May include owner-authored question answers.",
      inputSchema: { jobId: id, key: id },
      annotations: read,
      _meta,
    },
    (a) =>
      run("get_study_lesson_checkpoint", a, () => "Study checkpoint loaded."),
  );
  server.registerTool(
    "finalize_study_lesson",
    {
      outputSchema: jobOutput,
      description:
        "Validate complete reading, concept coverage, original question preservation, independently evidenced answers, media review, duplicate cards and course placement; then atomically save native lesson, quizzes, inline flashcards and glossary as drafts. Reuses explicitly selected matching assets. No publication; embedded draft assets become playable after authorized publication. Failures preserve checkpoints and report actionable problems. Repeated success returns the same lesson URL.",
      inputSchema: edit,
      annotations: write,
      _meta,
    },
    (a) => run("finalize_study_lesson", a, summary),
  );
  server.registerTool(
    "publish_study_lesson",
    {
      outputSchema: jobOutput,
      description:
        "Publish the finalized study lesson and its native quizzes/flashcards when the user requested publication or returned profile.publish is true. Embedded quizzes and cards require public assets under existing Chaos rules, even for restricted lessons; disclose this when selecting visibility. Never changes source sharing. Source metadata/images must already have required visibility. For course lessons, refuse publication that would publish other unreviewed drafts. Safe to retry a completed job.",
      inputSchema: edit,
      annotations: { ...write, openWorldHint: true },
      _meta,
    },
    (a) => run("publish_study_lesson", a, summary),
  );
  server.registerTool(
    "set_study_teaching_profile",
    {
      outputSchema: z.object({ saved: z.boolean() }),
      description:
        "Remember reusable teaching preferences as the default or for an owned course. Course preferences override defaults; per-job preferences override both. Store only the learner's requested preferences. publish true is standing authorization for future study-job publication; record it only when explicitly requested.",
      inputSchema: { courseId: id.optional(), profile },
      annotations: write,
      _meta,
    },
    (a) =>
      run(
        "set_study_teaching_profile",
        { ...a, profile: resolveProfile(a.profile) },
        () => "Teaching preferences saved.",
      ),
  );
  server.registerTool(
    "get_study_source_content",
    {
      outputSchema: z.object({
        metadata: z.record(z.string(), z.unknown()),
        contentType: z.string().nullable(),
        data: z.string().nullable(),
        totalBytes: z.number(),
        nextOffset: z.number().nullable(),
      }),
      description:
        "Read an explicitly selected source with independent content and metadata authorization. Files return base64 in at most 128 KiB pages; follow nextOffset and reconstruct locally to inspect all pages and visuals. References return metadata and URL, not fetched text. Never infers access from a lesson citation.",
      inputSchema: {
        sourceId: id,
        offset: z.number().int().nonnegative().optional(),
      },
      annotations: read,
      _meta,
    },
    (a) =>
      run(
        "get_study_source_content",
        a,
        () => "Authorized source content loaded.",
      ),
  );
  server.registerTool(
    "register_study_reference",
    {
      outputSchema: z.object({ sourceId: id, duplicate: z.boolean() }),
      description:
        "Register metadata for a URL, video or reference the client actually consulted. This does not fetch or verify its content. Uses exact owner metadata matching to reuse prior references. Private by default; metadataVisibility public makes citation metadata public only when user-authorized. Never exposes reference file bytes or changes existing source sharing.",
      inputSchema: {
        metadata: z.object({
          title: text.max(200),
          kind: z.enum(["url", "video", "reference"]),
          origin: text.max(500),
          url: z.url().optional(),
          author: z.string().max(200).optional(),
          license: z.string().max(300).optional(),
        }),
        metadataVisibility: z.enum(["private", "public"]).optional(),
      },
      annotations: write,
      _meta,
    },
    (a) =>
      run(
        "register_study_reference",
        a,
        () => "Source reference registered; content was not fetched.",
      ),
  );
  server.registerTool(
    "publish_study_source",
    {
      description:
        "Explicitly publish citation metadata (title, origin, author, license, reference URL) for an owned selected source when user-authorized. File bytes retain their existing visibility. includeImage true also makes an owned image's bytes public only when the user authorizes embedding that image in a published lesson; it is rejected for PDFs/slides/other files. Use for new source assets in an authorized publication workflow; never silently change existing source sharing. Requires publish_content permission and is safe to retry.",
      inputSchema: { sourceId: id, includeImage: z.boolean().optional() },
      outputSchema: {
        sourceId: id,
        metadataVisibility: z.literal("public"),
        contentVisibility: z.enum(["private", "public", "restricted"]),
      },
      annotations: { ...write, openWorldHint: true },
      _meta,
    },
    (a) =>
      run(
        "publish_study_source",
        a,
        () => "Authorized source citation metadata published.",
      ),
  );
  server.registerTool(
    "upload_study_source",
    {
      outputSchema: z.object({
        receivedChunks: z.number(),
        totalChunks: z.number(),
        sourceId: id.nullable(),
      }),
      description:
        "Explicit cross-client file transfer. Send base64 chunks of at most 128 KiB decoded bytes, indexed from zero under one stable upload key. Include unchanged metadata, contentType and totalChunks on each call. Returns sourceId only after every chunk arrives and file signature is verified; partial uploads are resumable for 24 hours. Supports Chaos source MIME types and 25 MB total; no fetching local paths, client attachment IDs or arbitrary remote URLs. Files remain private. Repeated chunks must have identical bytes.",
      inputSchema: {
        key: id.regex(/^[A-Za-z0-9_-]+$/),
        index: z.number().int().nonnegative().max(199),
        totalChunks: z.number().int().min(1).max(200),
        data: z.string().max(174764),
        contentType: text.max(200),
        metadata: z.object({
          title: text.max(200),
          kind: z.enum(["pdf", "slides", "image", "file"]),
          origin: text.max(500),
          author: z.string().max(200).optional(),
          license: z.string().max(300).optional(),
        }),
      },
      annotations: write,
      _meta,
    },
    (a) =>
      run("upload_study_source", a, (d) =>
        d.sourceId
          ? "Source transferred to Chaos."
          : "Source chunk saved; continue transfer.",
      ),
  );
}
