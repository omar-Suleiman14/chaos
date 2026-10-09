import { LEARN_LIMITS, LEARN_WRITE_LIMITS } from "./learnModel";
import { MAX_FOLDER_MOVE_NODES } from "./folderModel";
import { PERSONAL_LIMITS } from "./learnPersonalModel";
import { CONTEXT_LIMITS } from "./learnContextModel";
import { PRACTICE_LIMITS } from "./learnPracticeModel";

/** Enforced bounds shared across clients; these are not measured throughput claims. */
export const learnCapabilityLimits = {
  ...LEARN_LIMITS, ...LEARN_WRITE_LIMITS,
  readBlocks: 100, blockOperations: 100, citationsPerBlock: 20, conceptsPerBlock: 20,
  folderMoveNodes: MAX_FOLDER_MOVE_NODES, selectedAssets: 500, collectionItems: 100,
  curriculumMappings: 100, mappingBlocks: 100, mappingConcepts: 100,
  progressCompletedBlocks: LEARN_LIMITS.blocks, recoverySnapshots: 10, versionPage: 50,
  flashcardsPerSet: 500, flashcardAttachments: 50, assessmentAttachments: 50,
  personalAnnotationsPerLesson: PERSONAL_LIMITS.perLesson, followedModules: PERSONAL_LIMITS.follows,
  personalNoteCharacters: PERSONAL_LIMITS.noteCharacters, personalQuoteCharacters: PERSONAL_LIMITS.quoteCharacters,
  contextBlocks: 30, contextSources: 20, contextSelectionBytes: 50_000, contextBytes: 100_000,
  contextExcerpts: CONTEXT_LIMITS.excerpts, contextExcerptBytes: CONTEXT_LIMITS.excerptBytes,
  contextCurriculumMappings: CONTEXT_LIMITS.curriculumMappings, storedSourceExcerpts: CONTEXT_LIMITS.storedExcerpts,
  storedSourceExcerptBytes: CONTEXT_LIMITS.storedBytes, practiceConcepts: PRACTICE_LIMITS.concepts,
  practiceRecentEvidence: PRACTICE_LIMITS.recentEvidence, practiceCandidatesPerConcept: PRACTICE_LIMITS.candidatesPerConcept,
  practiceForms: PRACTICE_LIMITS.forms, practiceQuestions: PRACTICE_LIMITS.selection,
} as const;

/**
 * What the ChatGPT app can do, by area, so an assistant can discover its own tools.
 * Every name must be a registered MCP tool (tests/unit/mcpCapabilities.test.ts checks this).
 */
export const mcpToolGroups = {
  studyLessons: { tools: ["get_study_lesson_skill", "refresh_study_lesson_placement", "build_study_lesson", "checkpoint_study_lesson", "get_study_lesson_job", "get_study_lesson_checkpoint", "finalize_study_lesson", "publish_study_lesson", "set_study_teaching_profile", "publish_study_source", "upload_study_source", "get_study_source_content", "register_study_reference"], notes: "Client-taught durable study jobs with explicit cross-client file transfer, complete source/visual reading receipts, native quiz/card embeds, stored teaching profiles and retry-safe publication. No backend AI provider required." },
  cards: { tools: ["get_my_card", "customize_my_card", "list_my_students", "set_student_card_visibility", "get_student_card_visibility", "get_student_card_preferences", "set_student_card_preferences", "list_public_authors", "get_public_card", "list_public_student_cards", "set_author_listing_visibility"], notes: "Own Card customization, private student roster and public author/student Cards. Student Cards are private until the student opts in, globally or per teacher; opt-outs win. Side areas load pages as needed and virtualize visible cards. Anonymous participants never receive public Cards. Listing preferences affect only the authenticated author; fanning is a browser interaction at /card." },
  lessons: { tools: ["list_lessons", "search_lessons", "get_lesson", "get_lesson_outline", "get_lesson_sources", "get_lesson_progress", "restart_lesson_progress", "get_weak_area_actions", "create_lesson", "save_lesson_draft", "edit_lesson_blocks", "add_lesson_blocks", "update_lesson_blocks", "move_lesson_blocks", "delete_lesson_blocks", "publish_lesson", "set_lesson_lifecycle", "list_lesson_versions", "get_lesson_version", "restore_lesson_version", "fork_lesson", "get_learn_source_metadata"], notes: "Lessons are drafts until publish_lesson. Cover image is metadata.coverUrl (https link or /covers/ gallery path); icon is an optional Lucide icon name or emoji in metadata.icon." },
  courses: { tools: ["list_courses", "get_course", "get_course_lesson", "get_course_progress", "remember_course", "set_course_modules", "export_course_manifest", "import_course_lesson", "create_full_course", "create_course", "update_course", "add_course_lesson", "set_course_outline", "publish_course", "unpublish_course", "set_course_archived"], notes: "A course is an ordered list of lessons. create_full_course creates drafts unless publication is explicitly requested. Cover image is coverUrl on update_course. publish_course uses already published lesson versions and leaves lesson drafts private. Archive hides a course; restore with archived false." },
  flashcards: { tools: ["list_flashcard_sets", "get_flashcard_set", "create_flashcard_set", "save_flashcard_set", "publish_flashcard_set", "set_flashcard_set_lifecycle", "attach_lesson_flashcards", "detach_lesson_flashcards", "get_lesson_flashcards"], notes: "Sets start private and editable. Publishing makes an immutable version; attach a published version to an owned lesson." },
  games: { tools: ["create_game_draft", "list_games", "get_game", "host_game", "set_game_settings", "advance_game", "end_game", "create_lesson_live_game"], notes: "A game is a quiz form played live. Publish the quiz with publish_form before host_game. Pro required." },
  lessonQuizzes: { tools: ["attach_lesson_quiz", "get_lesson_quizzes"], notes: "Attach an owned quiz to a lesson. Quizzes made with create_form or create_game_draft are kind form." },
  glossary: { tools: ["set_lesson_glossary", "get_lesson_glossary"], notes: "Look-up definitions readers tap in a lesson. Add them unprompted after writing a lesson with hard words; translations default to Arabic." },
  folders: { tools: ["list_folders", "list_folder_contents", "create_folder", "move_folder", "add_folder_member"], notes: "Private organisation only; never publishes." },
} as const satisfies Record<string, { tools: readonly string[]; notes: string }>;
