import { registerDocumentationTools } from "./docs";
import { registerCardTools } from "./cards";
import { registerCrmTools } from "./crm";
import { registerAdminTools } from "./admin";
// The Chaos ChatGPT app: MCP tool definitions. Served by app/mcp/route.ts.
// Tools only describe and forward; Convex (convex/mcp.ts) enforces access,
// validation, plan limits and rate limits for the signed-in Chaos account.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  MCP_APPEARANCES, MCP_BACKDROPS, MCP_BUTTONS, MCP_COVERS, MCP_FONTS, MCP_GAME_STATES, MCP_GAME_STEPS, MCP_LAYOUTS, MCP_PRESENTATIONS, MCP_QUESTION_TYPES, MCP_RADII, MCP_SOUNDS, normalizeSound,
} from "@/convex/mcpContract";
import { buildThemePatch, themeCatalog } from "./themes";
import { registerLearnTools } from "./learn";
import { registerTools as registerAdvancedFormTools } from "./advancedForms";
import { registerTools as registerFormManagementTools } from "./formManagement";
import { registerCommunityTools } from "./community";
import { registerQuizForkTools } from "./quizForks";
import { registerAssessmentTools } from "./assessments";
import { registerGlossaryTools } from "./glossary";
import { permissionForTool, requireToolPermission, type McpPermission } from "./permissions";
import { registerCourseTools } from "./courses";
import { registerFlashcardTools } from "./flashcards";
import { registerOrganizationTools } from "./organization";
import { registerTeamTools } from "./teams";
import { chaosIntegration } from "@/lib/integrations";
import { McpToolError, toolError } from "./errors";

export type McpCaller = (tool: string, input: Record<string, unknown>) => Promise<unknown>;

export const MCP_SERVER_NAME = chaosIntegration.id;
export const MCP_SERVER_VERSION = chaosIntegration.version;

/** Chaos uses one permission set; Clerk issues the standard OpenID scopes. */
export const MCP_SCOPES = process.env.NEXT_PUBLIC_AUTH_PROVIDER === "betterauth" ? ["profile", "email"] : ["openid", "profile", "email"];
const securitySchemes = [{ type: "oauth2", scopes: MCP_SCOPES }];

const baseInstructions = `Chaos (chaos.fail) is where this person builds forms, surveys, quizzes, Learn lessons and courses, organises owned content in folders, and reads authorized published material and requested answers.
- The Chaos app is free on every plan.
- Cards: list_public_authors browses the opted-in author directory; get_public_card resolves current usernames and retained aliases. list_public_student_cards pages through all eligible students, public by default unless opted out. Follow cursors until isDone. get_student_card_preferences and set_student_card_preferences read/change the global default for this person; customize_my_card also accepts showStudentCards. get_student_card_visibility and set_student_card_visibility concern only this person's existing teacher relationship. set_author_listing_visibility controls only this person's directory listing. The card fan animation is a browser interaction at https://chaos.fail/card.
- The person has chosen that new things go live: create_form, create_game_draft, create_lesson, create_full_course and create_flashcard_set publish as soon as they are created (lessons, courses and flashcards as public). Pass publish false only when the person asks for a draft or private work. If publishing is blocked, the result lists the problems and the item stays a draft: tell the person what to fix. Later edits to existing content are drafts until publish_form, publish_lesson or publish_course. Folders are private organisation, not publishable content.
- Work only on content the person selected or asked to find. Authorization is enforced for the connected account; never supply an actor/userId or infer permission from a reference. Folder membership and source metadata do not grant content access. Only request source metadata through the supported tools; no source file bytes are exposed here.
- Forms return shareUrl: share it only when returned and published. Lesson and course tools do not return shareUrl. After publish_lesson returns ok true, use the lessonId from a verified create/get response to construct https://chaos.fail/learn/<lessonId>. After publish_course returns ok true, use courseId from verified create_course (or id from get_course) to construct https://chaos.fail/learn/courses/<courseId>. Never invent IDs, claim draft links are public, or imply private/restricted links grant access. Visibility values are public, restricted and private; restricted/private require Business.
- Courses: create_course creates a draft; add_course_lesson creates a blank lesson draft; use lesson tools to write it. get_course reads the owner's outline and metadata. update_course edits draft metadata. set_course_outline replaces the full ordered list, so read get_course first and preserve wanted lessons. publish_course publishes the course and all its lessons together; lessons in an unpublished course can't be published on their own. Inspect blockers when ok is false. Do not automatically retry course/lesson creation or publication after uncertain success. list_courses lists the person's courses; set_course_archived archives or restores one; unpublish_course takes a course offline. Every course and lesson has a cover: new ones get a random gallery cover, so set one only when the person asks; change it with update_course coverUrl or lesson metadata.coverUrl. Page icons are not shown, so don't set them.
- Flashcards: create_flashcard_set makes a private set; get_flashcard_set returns cards and revision; save_flashcard_set replaces the whole card list, so keep card IDs. publish_flashcard_set makes an immutable version only on request; attach_lesson_flashcards links that version to an owned lesson. set_flashcard_set_lifecycle archives, restores or unpublishes.
- Glossary: after writing or substantially editing a lesson, call set_lesson_glossary without being asked for the technical, rare or easily confused words a learner may not know. Give a short definition, the translation and the meaning explained in the learner's language (Arabic unless the person says otherwise). Readers tap highlighted terms for a look-up card.
- get_learn_capabilities lists the lesson, course, flashcard, game and folder tools with limits; call it when unsure what Chaos can do.
- Lessons: search_lessons/list_lessons use scope owned for drafts or public for published discovery. get_lesson draft and get_lesson_outline with outlineFrom draft require edit permission; outlines default to published. get_lesson and get_lesson_outline return bounded pages: offset 0?500, limit 1?100; follow nextOffset until null instead of claiming the first page is complete. Keep stable block IDs and use the current expectedRevision for edits; on conflict reload before making a reviewed change.
- Teams: Personal is one user. Business teams (free for a limited time) share editing: list_teams, create_team, invite_team_member (returns a single-use link; Chaos sends no email), list_team_members, change_team_member_role, remove_team_member, share_with_team and list_team_resources. Team-only (internal) content: publish_lesson, publish_course and publish_flashcard_set with visibility restricted and teamId; set_form_response_controls with access signed_in and audienceTeamId for forms and quizzes; host_game with teamId. Only members of that team can read, respond or join. Invite, remove or change roles only on explicit request.
- Folders: list_folders and list_folder_contents use paginationOpts and continueCursor, including empty partial pages. create_folder creates an owned private folder; add_folder_member requires ownership of both folder and asset; move_folder needs explicit relocation intent. Folder changes never publish content.
- A quiz is a form with quizMode on. For "make a quiz about what we discussed", write the questions from the conversation yourself: mostly single_choice with 3–4 options, set correctAnswers to the exact option label, and give points.
- Write like a real teacher or organiser, not a brochure. Each question is one short, direct sentence (usually under 15 words) that tests one fact or asks one thing. Options are 1–5 words, parallel in form, and every wrong option is plausible; no "All of the above", joke options or filler. Leave question descriptions empty unless a hint is truly needed. A quiz explanation, if any, is one plain sentence saying why the answer is right. Titles are 2–6 words; the intro is one sentence or empty. No emojis, exclamation marks, hype ("ultimate", "fun-filled", "dive into", "journey", "test your knowledge") or restating the question in the options.
- Use natural, human language in all content and chat replies. Write short, clear sentences. Avoid em dashes; use periods or commas instead. Avoid promotional wording, jargon, stock phrases and filler. Match the person's language, including natural Arabic when they write in Arabic.
- Keep chat replies short: one or two sentences on what you made, then the link. Do not list the questions back unless the person asks.
- Ids look like form_… (forms and quizzes) or quiz_… (classic quizzes, read-only). Find them with search_forms.
- update_form replaces the question list when you send questions: call get_form first, keep each question's id, and send the full list.
- Looks: every form has a theme (colours, font, buttons, start screen). When you create a form, pick a preset that suits it and pass it as theme: "Lilac" for everyday forms and sign-ups, "Banner" for work and school, and a livelier one (Candy, Arcade, Neon, Sunset, Aurora) for games, parties and fun quizzes. Use list_themes to see them all, and set_form_theme for "make it dark", "use the Typeform look" or a brand colour. If the person names a look, use theirs. If set_form_theme returns warnings about hard-to-read colours, fix them.
- Sounds: forms you create have sound on (Glass). Pick a pack that suits the mood with sound (soft is Glass, pop, wood, arcade), and use off only when the person asks for silence or the form is formal or sensitive (health, HR, legal).
- Theme and sound changes go to the draft, like other edits; respondents see them after publish_form.
- Respondent answers can be personal. Only fetch them with list_responses when the person asks to read individual answers.
- Live games: create_game_draft makes a quiz draft with 1–100 choice questions, each with 2–4 distinct options and correctAnswers. It publishes on creation; call host_game only when asked to open a live lobby. Hosting does not publish or start the first question.
- Games use game_… ids from list_games or host_game. get_game returns room state and host/join links, never player identities, tokens, individual answers or answer keys. Use hostUrl for the projected question and leaderboard.
- Games run themselves by default: each question ends on its timer, the answer and then the leaderboard show for breakSec seconds (default 5), and the next question starts. startWhenPlayers makes the lobby count down 5-4-3-2-1 and start once that many have joined. Pass these to host_game when the host mentions them ("start when 20 join", "10 seconds between questions", "I'll click through myself" = autoAdvance false).
- set_game_settings changes a lobby's theme, timer (5–240 seconds), answer labels and startWhenPlayers; autoAdvance and breakSec can change at any time, so "pause the game" is autoAdvance false and "carry on" is autoAdvance true. It does not change the source quiz. Themes use the same presets as forms.
- advance_game moves exactly one state using from and questionIndex from get_game; with autoplay on it is only needed to start without waiting or to skip ahead. Starting needs a joined player. Advancing a question closes it and reveals the answer, so do it only when the host asks. Retries with the same from/index do not advance again. end_game stops the room and saves collected responses through the ordinary live-game workflow; never stop a room without the host's request.`;

/** Only verified administrator connections are told about admin and CRM tools; everyone else never sees them. */
const adminInstructions = `- Administrator connections expose the same platform overview/refresh, account and content moderation, platform inventories, Business teams and audit activity as the admin UI under admin_operations. Inventory tools return metadata only. Moderate accounts/content only on explicit request and provide the requested reason; never retry uncertain moderation writes. No admin membership grants/revocations or legacy plan controls are available. CRM remains separately authorized under admin_crm. Administrator connections also expose CRM tools: list_crm_contacts, get_crm_contact, save_crm_contact, add_crm_note, get_crm_activity, set_crm_contact_stages and complete_crm_follow_up. These contain private contact information. Read an existing contact before saving and preserve fields the administrator did not ask to change, including its linked account and follow-up date. CRM writes are audited; they never send messages. Do not retry creation or note additions after uncertain success.`;


const question = z.object({
  id: z.string().optional().describe("Keep the id from get_form when editing an existing question; omit for new questions."),
  type: z.enum(MCP_QUESTION_TYPES).describe("single_choice = pick one; multiple_choice = checkboxes; statement = text block with no answer; section = page break."),
  label: z.string().max(500).describe("The question text: one short, direct sentence."),
  description: z.string().max(5000).optional().describe("Optional help text under the question. Usually leave empty."),
  required: z.boolean().optional(),
  options: z.array(z.string().max(500)).max(100).optional().describe("Choices for single_choice, multiple_choice, dropdown and ranking; columns for matrix."),
  rows: z.array(z.string().max(500)).max(50).optional().describe("Rows for matrix questions."),
  min: z.number().optional().describe("scale start (0 or 1), number minimum, or minimum selections/characters."),
  max: z.number().optional().describe("rating steps (3–10), scale end (2–10), number maximum, or maximum selections/characters."),
  minLabel: z.string().max(200).optional().describe("Label for the low end of a rating or scale."),
  maxLabel: z.string().max(200).optional().describe("Label for the high end of a rating or scale."),
  correctAnswers: z.array(z.string()).optional().describe("Quiz mode only: the exact label(s) of the correct option(s). One for single_choice and dropdown."),
  points: z.number().min(0).max(1000).optional().describe("Quiz mode only: points for a correct answer (default 1)."),
  explanation: z.string().max(2000).optional().describe("Quiz mode only: one plain sentence shown after answering."),
});

const formFields = {
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().describe("Intro text shown at the top."),
  quizMode: z.boolean().optional().describe("true for a scored quiz with an answer key."),
  presentation: z.enum(MCP_PRESENTATIONS).optional().describe("page = all questions on one page (default); one_at_a_time = one question per screen; sections = one page per section; swipe = full-screen cards."),
  questions: z.array(question).max(200),
  theme: z.string().max(60).optional().describe("Optional look by name, e.g. Lilac (default), Banner, Paper, Evergreen, Spotlight (Typeform-like), Midnight (dark). See list_themes."),
  sound: z.string().max(20).optional().describe(`Optional sound pack for respondents: ${MCP_SOUNDS.join(", ")} (soft = Glass, the default; off = silent). Choose one that suits the form.`),
  publish: z.boolean().optional().describe("Default true: publish right after creating so the link works. Pass false only when the person asks for a draft."),
};

const soundField = z.string().max(20).describe(`One of ${MCP_SOUNDS.join(", ")}. soft is called Glass; off means silent.`);
const hex = (name: string) => z.string().regex(/^#[0-9a-fA-F]{6}$/, `${name} must be a six-digit hex colour like #1a73e8`).optional();
const themeFields = {
  preset: z.string().max(60).optional().describe("A preset by name or id, e.g. Lilac, Banner, Paper, Evergreen (also “chaos”), Spotlight, Midnight. Applied first; the properties below then override it. Sound and logo are kept."),
  accent: hex("accent").describe("Buttons and highlights, hex like #1a73e8."),
  pageColor: hex("pageColor").describe("Page background, hex."),
  surfaceColor: hex("surfaceColor").describe("Question card background, hex."),
  textColor: hex("textColor").describe("Text colour, hex. Must contrast with the page and card."),
  font: z.enum(MCP_FONTS).optional(),
  radius: z.enum(MCP_RADII).optional().describe("Corner roundness."),
  buttons: z.enum(MCP_BUTTONS).optional(),
  cover: z.enum(MCP_COVERS).optional().describe("Start screen style; none skips it."),
  backdrop: z.enum(MCP_BACKDROPS).optional().describe("Pattern behind the form."),
  layout: z.enum(MCP_LAYOUTS).optional().describe("flat = plain page; card = questions on cards; focus = centred, one thing at a time."),
  appearance: z.enum(MCP_APPEARANCES).optional().describe("auto adds a dark version for respondents in dark mode; fixed always uses these colours."),
};

const itemId = z.string().min(1).max(100).describe("The form or quiz id, e.g. form_… from search_forms.");

const read: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };

/** Loose output shapes: key fields are named for reviewers; extra fields pass through. */
const itemShape = {
  id: z.string(),
  kind: z.enum(["form", "classic_quiz"]),
  title: z.string(),
  status: z.string(),
  editUrl: z.string(),
  shareUrl: z.string().nullable(),
  resultsUrl: z.string(),
};
const itemOutput = z.looseObject(itemShape);

const gameId = z.string().min(1).max(100).describe("game_… id from list_games or host_game, not a form_ or quiz_ id.");
const timerField = z.number().int().min(5).max(240).optional().describe("Seconds per question; 5–240, default 20. Changes only in a lobby.");
const labelsField = z.boolean().optional().describe("Show option text on players' phones (default true). false requires a shared host screen for the options.");
const autoplayFields = {
  autoAdvance: z.boolean().optional().describe("Autoplay (default true): after each answer and leaderboard, move on by itself. false = the host presses Next. Can be changed during play to pause or resume."),
  breakSec: z.number().int().min(3).max(60).optional().describe("Seconds the answer, then the leaderboard, stay up during autoplay; 3–60, default 5. Can change during play."),
  startWhenPlayers: z.number().int().min(0).max(1000).optional().describe("Start a 5-second countdown automatically once this many players have joined; 0 = the host starts. Lobby only."),
};
const gameShape = {
  id: z.string(), kind: z.literal("live_game"), title: z.string(), state: z.enum(MCP_GAME_STATES),
  sourceId: z.string().nullable(), pin: z.string(), hostUrl: z.string(), joinUrl: z.string().nullable(),
  questionIndex: z.number(), questionCount: z.number(), skippedQuestions: z.number(), questionEndsAt: z.number().nullable(),
  settings: z.object({ timeLimitSec: z.number(), showAnswerLabels: z.boolean(), maxPlayers: z.number(), language: z.enum(["en", "ar"]), autoAdvance: z.boolean(), breakSec: z.number(), startWhenPlayers: z.number() }),
  nextStepAt: z.number().nullable().describe("When autoplay moves on (ms since epoch); null when paused or not on an answer/leaderboard screen."),
  startsAt: z.number().nullable().describe("When the lobby countdown ends and the first question starts."),
  theme: z.looseObject({}).nullable(), createdAt: z.string(), endedAt: z.string().nullable(),
  resultsStatus: z.string().nullable(), savedResponses: z.number(), unsavedResponses: z.number(),
};
const gameOutput = z.object(gameShape);

function meta(invoking: string, invoked: string) {
  return {
    securitySchemes,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
  };
}

export { McpToolError };

function ok(summary: string, data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(data)}` }],
    structuredContent: data === null ? { ok: true } : typeof data === "string" ? { id: data } : data as Record<string, unknown>,
  };
}

const problem = toolError;

function requireSound(value: string) {
  const sound = normalizeSound(value);
  if (!sound) throw new McpToolError("VALIDATION_FAILED", `sound must be one of ${MCP_SOUNDS.join(", ")} (soft is called Glass; off is silent).`);
  return sound;
}

/** Result that asks ChatGPT to (re)connect the Chaos account. */
export function authRequired(resourceMetadataUrl: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: "Connect your Chaos account to use this." }],
    _meta: {
      "mcp/www_authenticate": [
        `Bearer resource_metadata="${resourceMetadataUrl}", error="insufficient_scope", error_description="Sign in to Chaos"`,
      ],
    },
  };
}

export function createChaosMcpServer(options: { call: McpCaller | null; resourceMetadataUrl: string; admin?: boolean; permissions?: readonly McpPermission[] }): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION, title: chaosIntegration.name, websiteUrl: chaosIntegration.siteUrl,
    // Clients that show server icons display the Chaos mark instead of a generic MCP icon.
    icons: [
      { src: `${chaosIntegration.siteUrl}${chaosIntegration.logoPath}`, mimeType: "image/svg+xml", sizes: ["any"] },
      { src: `${chaosIntegration.siteUrl}/api/plugins/chaos-icon-512.png`, mimeType: "image/png", sizes: ["512x512"] },
    ],
  }, { instructions: options.admin ? `${baseInstructions}\n${adminInstructions}` : baseInstructions });

  // Schema failures the SDK catches before a handler runs get the same code, category and readable problems.
  (server as unknown as { createToolError: (message: string) => CallToolResult }).createToolError = (message) => toolError(new Error(message));
  const register = server.registerTool.bind(server);
  server.registerTool = (name, config, callback) => register(name, { ...config, _meta: { ...config._meta, "chaos/permission": permissionForTool(name) } }, callback);
  const run = async (tool: string, input: Record<string, unknown>, summarize: (data: Record<string, unknown>) => string): Promise<CallToolResult> => {
    if (!options.call) return authRequired(options.resourceMetadataUrl);
    try {
      requireToolPermission(tool, options.permissions);
      const data = (await options.call(tool, input)) as Record<string, unknown>;
      return ok(summarize(data), data);
    } catch (error) {
      return problem(error);
    }
  };

  // Multi-step tools chain existing, individually authorized calls. Each step is checked by Convex as the
  // connected account; a failure part-way returns what was created so the assistant can report it.
  const call = async (tool: string, input: Record<string, unknown>) => { requireToolPermission(tool, options.permissions); return (await options.call!(tool, input)) as Record<string, unknown>; };
  const flow = async (work: () => Promise<{ text: string; data: Record<string, unknown> }>): Promise<CallToolResult> => {
    if (!options.call) return authRequired(options.resourceMetadataUrl);
    try { const { text, data } = await work(); return ok(text, data); } catch (error) { return problem(error); }
  };
  /** Creates a form, then publishes it unless asked not to or it isn't ready yet. */
  const createThenPublish = (tool: string, input: Record<string, unknown>, publish: boolean, noun: string) => flow(async () => {
    const d = await call(tool, input);
    if (!publish) return { text: `Created ${noun} draft “${d.title}”. Edit: ${d.editUrl}`, data: { ...d, published: false } };
    if (!d.readyToPublish) return { text: `Created ${noun} draft “${d.title}”, but it can't publish yet: ${(d.problems as string[]).join(" ")} Edit: ${d.editUrl}`, data: { ...d, published: false } };
    const p = await call("publish_form", { id: d.id });
    return { text: `Published ${noun} “${p.title}”: ${p.shareUrl}`, data: { ...d, ...p, published: true } };
  });

  server.registerTool("create_game_draft", {
    title: "Create a quiz game draft",
    description: "Create a private quiz draft for live play using the ordinary Chaos builder and themes. Needs 1–100 single_choice, multiple_choice or dropdown questions, each with 2–4 distinct options and correctAnswers. Publishes the quiz straight away (publish false keeps a draft) but never opens a room: call host_game when the person asks to host.",
    inputSchema: {
      title: formFields.title, description: formFields.description,
      questions: z.array(question.extend({ type: z.enum(["single_choice", "multiple_choice", "dropdown"]), options: z.array(z.string().trim().min(1).max(500)).min(2).max(4), correctAnswers: z.array(z.string()).min(1).max(4) })).min(1).max(100),
      theme: formFields.theme, sound: formFields.sound, publish: formFields.publish,
    },
    outputSchema: { ...itemShape, readyToPublish: z.boolean(), problems: z.array(z.string()), published: z.boolean() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    _meta: meta("Creating a game draft…", "Game draft created"),
  }, ({ theme, sound, publish, ...input }) => {
    try {
      const form = { ...input, theme: buildThemePatch({ preset: theme ?? "Evergreen" }).patch, ...(sound ? { sound: requireSound(sound) } : {}) };
      return createThenPublish("create_game_draft", { form }, publish !== false, "game quiz");
    } catch (error) { return Promise.resolve(problem(error)); }
  });

  server.registerTool("list_games", {
    title: "List hosted games",
    description: "List the signed-in account's hosted game rooms, newest first, including ended rooms. Paged, at most 50 per call. Quiz drafts are found with search_forms. Returns state, settings and links; no participant names, answers, answer keys or player secrets. Pro required.",
    inputSchema: { limit: z.number().int().min(1).max(50).optional(), cursor: z.string().max(2000).optional().describe("nextCursor from the previous page.") },
    outputSchema: { games: z.array(gameOutput), nextCursor: z.string().nullable() },
    annotations: read, _meta: meta("Finding your games…", "Games loaded"),
  }, (input) => run("list_games", input, (d) => `${(d.games as unknown[]).length} game room(s).`));

  server.registerTool("get_game", {
    title: "Get a hosted game",
    description: "Get one owned live game's state, zero-based questionIndex (-1 in a lobby), timing, settings and host/join links. No questions, answer keys, participant names or individual responses are returned. Use this state before advance_game. Pro required.",
    inputSchema: { id: gameId }, outputSchema: gameShape, annotations: read,
    _meta: meta("Opening the game…", "Game loaded"),
  }, (input) => run("get_game", input, (d) => `“${d.title}”: ${d.state}. Host: ${d.hostUrl}`));

  server.registerTool("host_game", {
    title: "Open a live game lobby",
    description: "Create a joinable lobby from the account owner's already published quiz (form_… or quiz_…). Snapshots the published questions and theme; draft changes are not used. Refuses drafts, closed/archived forms and quizzes without eligible choices/correct answers. Never publishes or starts the first question. teamId makes the game team-only: only signed-in members of that Business team can join; a team-only quiz makes its games team-only automatically. Creates a new room each call, so do not automatically retry after an uncertain response. Host only on explicit request. Pro required.",
    inputSchema: { id: itemId, teamId: z.string().min(1).max(100).optional(), language: z.enum(["en", "ar"]).optional(), theme: formFields.theme, timeLimitSec: timerField, showAnswerLabels: labelsField, ...autoplayFields },
    outputSchema: gameShape,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    _meta: meta("Opening a game lobby…", "Lobby ready"),
  }, ({ theme, ...input }) => {
    try {
      return run("host_game", { ...input, ...(theme ? { theme: buildThemePatch({ preset: theme }).patch } : {}) }, (d) => `Lobby for “${d.title}” is open. PIN ${d.pin}. Join: ${d.joinUrl}. Host: ${d.hostUrl}`);
    } catch (error) { return Promise.resolve(problem(error)); }
  });

  server.registerTool("set_game_settings", {
    title: "Change game lobby settings",
    description: "Host-only, Pro: change a game's settings. Theme preset, question timer (5–240 s), showAnswerLabels and startWhenPlayers change only in the lobby. autoAdvance and breakSec change at any time: autoAdvance false pauses autoplay, true resumes it. Does not edit or republish the source quiz. Send at least one setting.",
    inputSchema: { id: gameId, theme: formFields.theme, timeLimitSec: timerField, showAnswerLabels: labelsField, ...autoplayFields },
    outputSchema: gameShape,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
    _meta: meta("Updating the lobby…", "Lobby settings updated"),
  }, ({ theme, ...input }) => {
    try {
      if (theme === undefined && Object.values(input).filter((v) => v !== undefined).length <= 1) throw new McpToolError("VALIDATION_FAILED", "Choose at least one setting.");
      return run("set_game_settings", { ...input, ...(theme ? { theme: buildThemePatch({ preset: theme }).patch } : {}) }, (d) => `Updated the lobby for “${d.title}”.`);
    } catch (error) { return Promise.resolve(problem(error)); }
  });

  server.registerTool("advance_game", {
    title: "Advance a live game one step",
    description: "Host-only, Pro: lobby → first question → reveal → leaderboard → next question (or end). Use from and questionIndex from get_game. Starting needs a joined player; advancing from question closes it early and reveals answers to the room. Act only on the host's explicit request. A retry with the same from/index is harmless; stale state does not advance. No answer keys are returned.",
    inputSchema: { id: gameId, from: z.enum(MCP_GAME_STEPS), questionIndex: z.number().int().min(-1).max(99) },
    outputSchema: gameShape,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: true },
    _meta: meta("Advancing the game…", "Game step complete"),
  }, (input) => run("advance_game", input, (d) => `“${d.title}” is now ${d.state}.`));

  server.registerTool("end_game", {
    title: "End a live game",
    description: "Host-only, Pro: stop a game immediately, prevent further play and save collected results using the existing live-game workflow. Does not delete the source quiz, collected responses or publish draft changes. Act only on an explicit request to end this room. Repeating for an ended room is harmless. Returns save status/counts, never individual responses.",
    inputSchema: { id: gameId }, outputSchema: gameShape,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: true },
    _meta: meta("Ending the game…", "Game ended"),
  }, (input) => run("end_game", input, (d) => `Ended “${d.title}”. Results: ${d.resultsStatus ?? "pending"}.`));

  server.registerTool("search_forms", {
    title: "Find forms and quizzes",
    description: "List or search the person's Chaos forms, surveys and quizzes (newest first). Returns ids, status, response counts and links. Archived items are hidden unless status is archived or any.",
    inputSchema: {
      query: z.string().max(200).optional().describe("Words in the title. Leave empty to list recent items."),
      status: z.enum(["live", "draft", "closed", "archived", "any"]).optional(),
      limit: z.number().int().min(1).max(50).optional().describe("Default 20."),
    },
    outputSchema: { total: z.number(), items: z.array(itemOutput) },
    annotations: { ...read, title: "Find forms and quizzes" },
    _meta: meta("Looking through Chaos…", "Found your forms"),
  }, (input) => run("search_forms", input, (d) => `${d.total} matching item${d.total === 1 ? "" : "s"}.`));

  server.registerTool("get_form", {
    title: "Open a form",
    description: "Get one form or quiz: title, questions, options, answer key (for quizzes), whether it is ready to publish, and links. Call this before update_form.",
    inputSchema: { id: itemId },
    outputSchema: { ...itemShape, questions: z.array(z.looseObject({ label: z.string(), type: z.string() })) },
    annotations: { ...read, title: "Open a form" },
    _meta: meta("Opening in Chaos…", "Opened"),
  }, (input) => run("get_form", input, (d) => `“${d.title}” (${d.status}).`));

  server.registerTool("get_results", {
    title: "Summarize results",
    description: "Results summary for a form or quiz: response count, completion, average time, per-question answer counts and averages, and average quiz score. Contains no individual answers.",
    inputSchema: { id: itemId },
    outputSchema: itemShape,
    annotations: { ...read, title: "Summarize results" },
    _meta: meta("Adding up results…", "Results ready"),
  }, (input) => run("get_results", input, (d) => `Results for “${d.title}”.`));

  server.registerTool("list_responses", {
    title: "Read responses",
    description: "Read individual completed responses (newest first), with each answer as text and quiz scores. Answers may contain personal information; use only when the person asks to read or analyse individual responses. Uploaded files are not included.",
    inputSchema: {
      id: itemId,
      limit: z.number().int().min(1).max(25).optional().describe("Default 10."),
      cursor: z.string().max(2000).optional().describe("nextCursor from the previous page."),
    },
    outputSchema: { ...itemShape, responses: z.array(z.looseObject({ hidden: z.record(z.string(), z.string()).optional(), typedHidden: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional() })), nextCursor: z.string().nullable() },
    annotations: { ...read, title: "Read responses" },
    _meta: meta("Reading responses…", "Responses loaded"),
  }, (input) => run("list_responses", input, (d) => `${(d.responses as unknown[]).length} response(s) from “${d.title}”.`));

  server.registerTool("create_form", {
    title: "Create a form or quiz",
    description: "Create a new form, survey or quiz as a draft in the person's Chaos library, with all its questions. For a quiz set quizMode true and give correctAnswers (exact option labels) and points on choice questions. Pass a theme (a preset name) that suits the form; the default is Lilac. Sound is on (Glass) unless you pass sound, e.g. off for formal or sensitive forms. Publishes straight away and returns the share link, unless publish is false or something must be fixed first (then it stays a draft and the problems are listed).",
    inputSchema: formFields,
    outputSchema: { ...itemShape, readyToPublish: z.boolean(), problems: z.array(z.string()), published: z.boolean() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false, title: "Create a form or quiz" },
    _meta: meta("Creating in Chaos…", "Created"),
  }, (input) => {
    const { theme, sound, publish, ...form } = input;
    let extra: Record<string, unknown>;
    try {
      extra = {
        ...(theme ? { theme: buildThemePatch({ preset: theme }).patch } : {}),
        ...(sound ? { sound: requireSound(sound) } : {}),
      };
    } catch (error) {
      return Promise.resolve(problem(error));
    }
    return createThenPublish("create_form", { form: { ...form, ...extra } }, publish !== false, form.quizMode ? "quiz" : "form");
  });

  server.registerTool("update_form", {
    title: "Edit a draft",
    description: "Change a form's draft: title, description, quiz mode, layout, or the question list. When questions is sent it replaces the whole list — questions left out are removed — so start from get_form and keep ids. Respondents keep seeing the live version until publish_form.",
    inputSchema: {
      id: itemId,
      expectedRevision: z.number().int().optional().describe("revision from get_form; the edit is refused if the form changed since."),
      changes: z.object({
        title: formFields.title.optional(),
        description: formFields.description,
        quizMode: formFields.quizMode,
        presentation: formFields.presentation,
        questions: formFields.questions.optional().describe("The complete new question list."),
      }),
    },
    outputSchema: { ...itemShape, readyToPublish: z.boolean(), problems: z.array(z.string()) },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true, title: "Edit a draft" },
    _meta: meta("Saving the draft…", "Draft saved"),
  }, (input) => run("update_form", input, (d) => `Saved “${d.title}”.`));

  const themeOutput = { ...itemShape, readyToPublish: z.boolean(), problems: z.array(z.string()), theme: z.looseObject({}), warnings: z.array(z.string()) };

  server.registerTool("list_themes", {
    title: "List looks and sounds",
    description: "List the form looks (themes) and the choices for fonts, buttons, start screens, backdrops, corner radius, layouts and sound packs (including off). Call before set_form_theme when the person asks for a style you are unsure about.",
    inputSchema: {},
    outputSchema: { presets: z.array(z.looseObject({ id: z.string(), name: z.string(), description: z.string() })), options: z.looseObject({}), notes: z.array(z.string()) },
    annotations: { ...read, title: "List looks and sounds" },
    _meta: meta("Looking up looks…", "Looks ready"),
  }, async () => {
    if (!options.call) return authRequired(options.resourceMetadataUrl);
    try {
      // The call checks the account and Pro plan like every other tool; the list itself is static.
      await options.call("list_themes", {});
      const data = themeCatalog();
      return ok(`${data.presets.length} looks and 5 sound choices.`, data);
    } catch (error) {
      return problem(error);
    }
  });

  server.registerTool("set_form_theme", {
    title: "Change a form's look",
    description: "Change the look of a form's draft: apply a preset by name (Lilac, Banner, Paper, Evergreen, Midnight…) and/or set individual properties such as accent or background colour (hex), font, corner radius, buttons, start screen, backdrop, layout, or fixed/auto dark mode. Only what you send changes; the logo and sound are kept. Colours that are hard to read are reported in warnings. Respondents see it after publish_form.",
    inputSchema: {
      id: itemId,
      expectedRevision: z.number().int().optional().describe("revision from get_form; the edit is refused if the form changed since."),
      ...themeFields,
    },
    outputSchema: themeOutput,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true, title: "Change a form's look" },
    _meta: meta("Restyling the draft…", "Look updated"),
  }, ({ id, expectedRevision, ...input }) => {
    let theme;
    try {
      theme = buildThemePatch(input);
      if (!Object.keys(theme.patch).length) throw new McpToolError("VALIDATION_FAILED", "Choose a preset or at least one property to change.");
    } catch (error) {
      return Promise.resolve(problem(error instanceof McpToolError ? error : new McpToolError("VALIDATION_FAILED", (error as Error).message)));
    }
    return run("update_form", { id, expectedRevision, changes: { theme: theme.patch } }, (d) => {
      const warnings = (d.warnings as string[] | undefined) ?? [];
      return `Updated the look of “${d.title}”${theme.presetName ? ` (${theme.presetName})` : ""}.${warnings.length ? ` Check: ${warnings.join(" ")}` : ""}`;
    });
  });

  server.registerTool("set_form_sound", {
    title: "Turn form sounds on or off",
    description: "Choose the sound pack respondents hear while answering: soft (called Glass), pop, wood, arcade, or off for silence. Forms are silent by default; only turn sounds on when the person asks. Changes the draft; respondents hear it after publish_form.",
    inputSchema: {
      id: itemId,
      expectedRevision: z.number().int().optional().describe("revision from get_form; the edit is refused if the form changed since."),
      sound: soundField,
    },
    outputSchema: themeOutput,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true, title: "Turn form sounds on or off" },
    _meta: meta("Saving the sound…", "Sound updated"),
  }, ({ id, expectedRevision, sound }) => {
    let pack;
    try { pack = requireSound(sound); } catch (error) { return Promise.resolve(problem(error)); }
    return run("update_form", { id, expectedRevision, changes: { sound: pack } }, (d) => `“${d.title}” sound: ${pack === "off" ? "silent" : pack}.`);
  });

  server.registerTool("publish_form", {
    title: "Publish",
    description: "Publish the current draft so anyone with the link can respond. Only call when the person asks to publish or share. Returns the public shareUrl, or what must be fixed first.",
    inputSchema: { id: itemId },
    outputSchema: itemShape,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false, title: "Publish" },
    _meta: meta("Publishing…", "Published"),
  }, (input) => run("publish_form", input, (d) => `“${d.title}” is published: ${d.shareUrl}`));

  server.registerTool("set_form_status", {
    title: "Close, reopen or archive",
    description: "close stops new responses; reopen accepts them again; archive hides the form from the library (reversible, nothing is deleted); restore brings an archived form back. Owners only.",
    inputSchema: { id: itemId, action: z.enum(["close", "reopen", "archive", "restore"]) },
    outputSchema: itemShape,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true, title: "Close, reopen or archive" },
    _meta: meta("Updating status…", "Status updated"),
  }, (input) => run("set_form_status", input, (d) => `“${d.title}” is now ${d.status}.`));

  if (options.admin) registerDocumentationTools(server, run, securitySchemes);
  if (options.admin) registerCrmTools(server, run, securitySchemes);
  if (options.admin) registerAdminTools(server, run, securitySchemes);
  registerCardTools(server, run, securitySchemes);
  registerLearnTools(server, run, securitySchemes, { call, flow });
  registerOrganizationTools(server, run, securitySchemes);
  registerTeamTools(server, run, securitySchemes);
  registerCourseTools(server, run, securitySchemes, { call, flow });
  registerFlashcardTools(server, run, securitySchemes, { call, flow });
  registerQuizForkTools(server, run, securitySchemes);
  registerCommunityTools(server, run, securitySchemes);
  registerAdvancedFormTools(server, run, securitySchemes);
  registerFormManagementTools(server, run, securitySchemes);
  registerAssessmentTools(server, run, securitySchemes);
  registerGlossaryTools(server, run, securitySchemes);
  return server;
}
