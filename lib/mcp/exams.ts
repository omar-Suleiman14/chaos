import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const id = z.string().min(1).max(100);
const revision = z.number().int().min(0);
const allocation = z.object({
  id: z.string().min(1).max(60),
  kind: z.enum(["course", "module", "lecture", "topic"]),
  key: z.string().max(100),
  count: z.number().int().min(1).max(100),
  points: z.number().positive().max(100),
  marking: z.object({
    mode: z.enum(["exact", "partial"]),
    incorrectPenalty: z.number().min(0),
    blankPenalty: z.number().min(0),
  }).optional(),
});
const selection = z.object({ questionId: id, allocationId: z.string().min(1).max(60) });
const settings = z.object({
  mode: z.enum(["anytime", "scheduled"]),
  opensAt: z.number().int().optional(),
  closesAt: z.number().int().optional(),
  durationMinutes: z.number().int().min(1).max(480),
  maxAttempts: z.number().int().min(1).max(3),
  requireAllAnswers: z.boolean(),
  allowEarlySubmission: z.boolean(),
  timeoutAction: z.enum(["auto_submit", "expire"]),
  passingPercent: z.number().min(0).max(100),
  resultVisibility: z.enum(["immediate", "after_close", "manual"]),
  showCorrectAnswers: z.boolean(),
  showExplanations: z.boolean(),
  integrityMode: z.enum(["off", "record", "warn", "review"]).optional(),
});
const audience = z.object({
  mode: z.enum(["all", "students", "groups"]),
  studentIds: z.array(z.string().min(1).max(160)).max(100),
  groupIds: z.array(id).max(100),
});
const draft = { draftId: id };
const edit = { ...draft, expectedRevision: revision };
const settingsView = { settings, revision, snapshotId: id.nullable(), snapshotVersion: z.number().nullable(), snapshotDraftRevision: z.number().nullable(), draftRevision: revision, preparedForAudience: z.boolean(), studentEntryEnabled: z.boolean() };
const audienceView = { audience, revision, assigned: z.boolean(), assignedAt: z.number().nullable(), prepared: z.boolean(), entryEnabled: z.boolean(), entryUrl: z.string().nullable() };
const resultsView = { snapshotId: id, title: z.string(), visibility: z.enum(["immediate", "after_close", "manual"]), publication: z.object({ released: z.boolean(), revision, releasedAt: z.number().nullable() }), entries: z.array(z.object({ attemptId: id, studentId: z.string(), state: z.string(), completedAt: z.number().nullable(), gradingState: z.string().nullable(), resultVisibility: z.string(), earnedCents: z.number().nullable(), maximumCents: z.number().nullable(), percentBasisPoints: z.number().nullable(), studentStatus: z.string() })), hasMore: z.boolean(), nextCursor: z.string().nullable() };
const revised = { revision };
const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const write = { ...read, readOnlyHint: false };
const publish = { ...write, openWorldHint: true, idempotentHint: false };

export function registerExamTools(
  server: McpServer,
  run: (tool: string, input: Record<string, unknown>, summarize: (data: Record<string, unknown>) => string) => Promise<CallToolResult>,
  securitySchemes: { type: string; scopes: string[] }[],
) {
  // Separate operations intentionally mirror the existing course editor; none is an admin bypass.
  const register = (
    name: string, description: string,
    inputSchema: z.ZodRawShape, outputSchema: z.ZodRawShape,
    annotations: typeof read,
  ) => server.registerTool(name, {
    description, inputSchema, outputSchema, annotations, _meta: { securitySchemes },
  }, input => run(name, input, () => "Course exam operation completed."));

  register("list_course_exams", "List private exam draft metadata for a course owned by the connected Chaos account. Never exposes student answers or answer keys.",
    { courseId: id }, { exams: z.array(z.object({ draftId: id, courseId: id, title: z.string(), targetCount: z.number(), selectedCount: z.number(), revision, updatedAt: z.number() })) }, read);
  register("get_course_exam", "Read an owned course exam draft, allocations, selected question IDs and revision. No answer keys. Review this before changing its syllabus.",
    draft, { draftId: id, courseId: id, title: z.string(), targetCount: z.number(), allocations: z.array(allocation), selections: z.array(selection), revision, editUrl: z.string() }, read);
  register("create_course_exam", "Create a private Course Exam Mode draft owned by the connected account. Not a form quiz; never publishes or assigns students. Do not retry blindly after uncertain success.",
    { courseId: id, title: z.string().min(1).max(200).optional() }, { draftId: id, revision, editUrl: z.string() }, { ...write, idempotentHint: false });
  register("save_course_exam_plan", "Save exam title, target count and syllabus allocations with optimistic revision checking. Changes to counts or allocations clear prior selections; review the draft first.",
    { ...edit, title: z.string().min(1).max(200), targetCount: z.number().int().min(1).max(100), allocations: z.array(allocation).min(1).max(30) }, revised, write);
  register("preview_course_exam", "Inspect source coverage, available questions, selected questions and feasibility for an owned exam draft. Does not return answer keys.",
    draft, { courseTitle: z.string(), modules: z.array(z.object({ id, title: z.string() })), lectures: z.array(z.object({ id, title: z.string() })), topics: z.array(z.string()), readyQuestions: z.number(), rows: z.array(z.object({ allocationId: z.string(), available: z.number(), requested: z.number(), selected: z.number() })), plannedCount: z.number(), feasible: z.boolean(), selected: z.array(z.record(z.string(), z.unknown())) }, read);
  register("list_course_exam_candidates", "List at most 30 eligible question-bank candidates for one allocation in an owned course exam draft. Prompts only; answer keys remain private.",
    { ...draft, allocationId: z.string().min(1).max(60), offset: z.number().int().min(0).max(1000).optional() },
    { total: z.number(), nextOffset: z.number().nullable(), questions: z.array(z.object({ questionId: id, prompt: z.string(), kind: z.string(), points: z.number(), selected: z.boolean(), selectedHere: z.boolean() })) }, read);
  register("select_course_exam_questions", "Replace all selected question IDs for an owned course exam draft, requiring a current draft revision and valid distinct questions. Does not publish.",
    { ...edit, selections: z.array(selection).max(100) }, revised, write);
  register("autofill_course_exam", "Select distinct ready questions from the owned exam's syllabus allocations. Replaces existing selection and requires the current draft revision; does not publish.",
    edit, revised, write);
  register("import_quiz_to_course_exam", "Copy the complete question list from an owned published quiz form into the private, ready course exam question bank and select it in an existing exam draft. Question order follows allocation order and counts; source question count must exactly match the exam plan. Requires the current draft revision and a published form version. Copies answer keys privately without changing the original quiz, publishing the exam or assigning students. Not safe to retry after an uncertain success; inspect get_course_exam first.",
    { ...edit, sourceFormId: id }, { imported: z.number(), revision }, { ...write, idempotentHint: false });
  register("list_my_exams", "List every Course Exam Mode exam the connected account owns, across all courses, with its stage (draft, sealed, ready, assigned, open), question count, time limit and edit URL. Never exposes answer keys or student data.",
    {}, { exams: z.array(z.object({ draftId: id, title: z.string(), courseId: id, courseTitle: z.string(), courseArchived: z.boolean(), targetCount: z.number(), selectedCount: z.number(), updatedAt: z.number(), stage: z.enum(["draft", "sealed", "ready", "assigned", "open"]), sealedVersion: z.number().nullable(), sealedIsCurrent: z.boolean(), questionCount: z.number(), totalPoints: z.number().nullable(), durationMinutes: z.number().nullable(), settingsSaved: z.boolean(), editUrl: z.string() })) }, read);
  register("check_quiz_for_exam", "Check whether an owned published quiz (or form) can be migrated into a course exam: how many questions carry over and how many are skipped (written, image, branching or unkeyed questions). Read-only; call before create_exam_from_quiz.",
    { formId: id }, { convertible: z.boolean(), title: z.string().nullable(), usable: z.number(), skipped: z.number(), total: z.number(), mixedPoints: z.boolean(), reason: z.string().optional() }, read);
  register("create_exam_from_quiz", "Migrate an owned published quiz into a new complete Course Exam Mode exam in one step: copies its choice questions and answer keys privately into the course question bank, builds the exam, and by default seals it and saves the given settings so it is ready to assign. Omit courseId to create a new course for it (newCourseTitle). Forms must be graded quizzes with marked answers. Never changes the quiz, assigns students or opens entry. Not safe to retry after an uncertain success; check list_my_exams first.",
    { sourceFormId: id, courseId: id.optional(), newCourseTitle: z.string().min(1).max(200).optional(), title: z.string().min(1).max(200).optional(), settings: settings.optional(), seal: z.boolean().optional() },
    { draftId: id, courseId: id, imported: z.number(), skipped: z.number(), mixedPoints: z.boolean(), sealed: z.boolean(), editUrl: z.string() }, { ...write, idempotentHint: false });
  register("seal_course_exam", "Freeze an immutable owner-only exam snapshot from a complete exam draft. Does not assign students, publish grades or enable student entry. Requires explicit instruction to seal.",
    edit, { snapshotId: id, version: z.number() }, write);
  register("get_course_exam_settings", "Read the owner-only settings, snapshot and settings revision for an exam draft. Does not expose answer keys.",
    draft, settingsView, read);
  register("save_course_exam_settings", "Save exam timing, attempt limits, integrity and result-release policy with the current settings revision. Does not grant student access; requires a sealed snapshot.",
    { ...edit, settings }, revised, write);
  register("prepare_course_exam", "Set readiness for an owned sealed exam after settings are saved. This only marks readiness; it never assigns a student or opens entry.",
    { ...edit, prepared: z.boolean() }, revised, write);
  register("get_course_exam_audience", "Read assigned audience metadata, audience revision and student-entry state for an owned course exam.",
    draft, audienceView, read);
  register("assign_course_exam", "Set or clear assignment to approved enrolled students/groups for an owned sealed, prepared exam. Assignment does not enable entry; require explicit user instruction.",
    { ...edit, audience, assigned: z.boolean() }, revised, publish);
  register("set_course_exam_entry", "Enable or disable student entry for an already assigned owned exam; this affects real students. Requires explicit instruction and the current audience revision. Never starts an attempt.",
    { ...edit, enabled: z.boolean() }, revised, publish);
  register("get_course_exam_results", "Read paginated teacher-only student attempt and grading status for an owned course exam. Contains identifiable student IDs and unreleased grades; use only when the user requests results.",
    { ...draft, snapshotId: id.optional(), cursor: z.string().nullable().optional() }, resultsView, read);
}
