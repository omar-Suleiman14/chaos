/**
 * Chaos Learn: the data the Learn screens read and write.
 *
 * This is the frontend contract. The screens only reach data through the hooks in
 * `lib/learn/data.ts`; today those hooks are backed by a local, per-device store
 * (`lib/learn/localStore.ts`) so every screen works end to end, and the Convex
 * backend replaces that store behind the same hooks. Keep field names product-neutral:
 * external apps (Max, ChatGPT, Claude) are clients of this model, not part of it.
 * See `docs/learn-frontend-contract.md`.
 */

/** Opaque string ids. Convex ids fit. */
export type LearnId = string;

/** A BlockNote document: the editor's block JSON, stored as-is. */
export type LessonContent = unknown[];

export type Visibility = "private" | "unlisted" | "public";

/** What moderation has decided about a piece of public content. `ok` is the normal state. */
export type ModerationState = "ok" | "under_review" | "restricted" | "removed" | "unavailable";

/** Editorial treatment of content, separate from who the author is. */
export type QualityStatus = "none" | "reviewed" | "featured";

/** Search engines: `index` only takes effect when the lesson is public and not restricted. */
export type IndexingChoice = "index" | "noindex";

export type LearnLanguage = "en" | "ar" | (string & {});

/** One level of the curriculum tree: University → Program → Version (syllabus year) → Year → Semester → Module. */
export type CurriculumKind = "university" | "program" | "version" | "year" | "semester" | "module";
export const CURRICULUM_LEVELS: readonly CurriculumKind[] = ["university", "program", "version", "year", "semester", "module"];

export interface CurriculumNode {
  id: LearnId;
  kind: CurriculumKind;
  name: string;
  parentId?: LearnId;
  /** Module code, e.g. "GIT-401". */
  code?: string;
  /** For `version` nodes: whether this is the syllabus currently taught. Old versions stay browsable. */
  current?: boolean;
  order?: number;
}

/**
 * Where a lesson applies. A lesson can map to several modules in several curricula; none of them
 * owns it. `path` is the display trail (university … module) at the time of mapping.
 */
export interface CurriculumRef {
  moduleId: LearnId;
  versionId: LearnId;
  path: string[];
  versionLabel: string;
}

export interface Affiliation { institution: string; role: "student" | "educator" | "other"; verified: boolean }

export type VerificationKind = "student" | "educator";
export type VerificationStatus = "none" | "pending" | "verified" | "rejected" | "expired";
export interface Verification { kind: VerificationKind; status: VerificationStatus; institution?: string; submittedAt?: number; decidedAt?: number; note?: string }

export interface Person {
  id: LearnId;
  name: string;
  username?: string;
  avatarUrl?: string;
  bio?: string;
  affiliations: Affiliation[];
  verifications: Verification[];
}

export interface LessonMeta {
  title: string;
  description: string;
  coverUrl?: string;
  tags: string[];
  language: LearnLanguage;
  curricula: CurriculumRef[];
  indexing: IndexingChoice;
  /** Shown to readers under the title; defaults to the owner's name. */
  authorDisplay?: string;
  /** Content licence the author chose, e.g. "CC BY 4.0". */
  license?: string;
}

/** Where a copy came from. Readers see it; it survives further forks (origin stays the first lesson). */
export interface Provenance {
  kind: "lesson" | "quiz" | "flashcards";
  sourceId: LearnId;
  sourceVersion?: number;
  sourceTitle: string;
  authorId: LearnId;
  authorName: string;
  forkedAt: number;
  /** The very first lesson in a chain of forks, when different from the direct source. */
  originId?: LearnId;
  originTitle?: string;
}

/** A link to the same content in a connected app (e.g. a Max page). Only set when a connection created or linked it. */
export interface ExternalRef {
  connectionId: LearnId;
  app: string;
  appName: string;
  kind: string;
  title: string;
  url?: string;
  linkedAt: number;
}

export type SourceKind = "pdf" | "slides" | "link" | "video" | "book" | "article" | "reference";

/** Original material a lesson is built from. Separate from lesson prose so readers can always tell them apart. */
export interface LessonSource {
  id: LearnId;
  kind: SourceKind;
  title: string;
  url?: string;
  /** Uploaded file (PDF/slides) in Learn storage. */
  fileId?: LearnId;
  fileName?: string;
  author?: string;
  /** Copyright holder or publisher, when different from the author. */
  owner?: string;
  year?: string;
  license?: string;
  /** e.g. "Lecture 8", "Guyton ch. 65". Used as the citation label. */
  shortLabel?: string;
  note?: string;
}

export type QuizKind = "quick_review" | "hard" | "past_exam" | "custom";

/** An existing Chaos quiz (form in quiz mode) attached to a lesson for practice. */
export interface AttachedQuiz {
  formId: string;
  /** Public respondent link id; readers open `/f/<shareId>`. */
  shareId: string;
  /** Quiz title when attached, shown if the label is empty. */
  title: string;
  label: string;
  kind: QuizKind;
  order: number;
  questionCount?: number;
}

export interface LessonStats { views: number; saves: number; helpful: number; notHelpful: number; forks: number }

export interface Lesson {
  id: LearnId;
  ownerId: LearnId;
  ownerName: string;
  /** Unpublished working copy. Always present; edits never touch the published version. */
  draft: { meta: LessonMeta; content: LessonContent; updatedAt: number };
  /** The version readers see. Absent until first publish. */
  published?: { version: number; meta: LessonMeta; content: LessonContent; publishedAt: number };
  /** `updatedAt` of the draft that was last published; a newer draft means unpublished changes. */
  publishedDraftAt?: number;
  visibility: Visibility;
  folderId?: LearnId;
  sources: LessonSource[];
  quizzes: AttachedQuiz[];
  forkedFrom?: Provenance;
  externalRef?: ExternalRef;
  stats: LessonStats;
  moderation: ModerationState;
  moderationNote?: string;
  quality: QualityStatus;
  qualityNote?: string;
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LessonVersion {
  lessonId: LearnId;
  version: number;
  meta: LessonMeta;
  content: LessonContent;
  publishedAt: number;
  publishedBy: string;
  note?: string;
}

/** Library folder. Nested via parentId. A folder marked as a collection can be published as a course or study pack. */
export interface Folder {
  id: LearnId;
  ownerId: LearnId;
  name: string;
  parentId?: LearnId;
  archived?: boolean;
  collection?: { description: string; visibility: Visibility; publishedAt?: number; coverUrl?: string };
  createdAt: number;
  updatedAt: number;
}

export type LibraryItemKind = "lesson" | "form" | "quiz" | "source" | "flashcards";

/** Membership of a non-lesson asset (forms, quizzes, uploaded sources, flashcards) in a folder. Lessons carry `folderId` themselves. */
export interface FolderItem { folderId: LearnId; kind: LibraryItemKind; refId: string; title: string; addedAt: number }

/** A curriculum module the learner studies ("My Courses"). */
export interface MyCourse { moduleId: LearnId; versionId: LearnId; addedAt: number; lastOpenedAt?: number }

export type SaveKind = "lesson" | "block";
export interface SavedItem {
  id: LearnId;
  kind: SaveKind;
  lessonId: LearnId;
  lessonTitle: string;
  blockId?: string;
  /** Text or caption of the saved block, so Saved reads well without loading the lesson. */
  excerpt?: string;
  imageUrl?: string;
  createdAt: number;
}

export type HighlightColor = "yellow" | "green" | "blue" | "pink";
/** Private. Anchored by block + quoted text so edits elsewhere in the lesson do not move it. */
export interface Highlight { id: LearnId; lessonId: LearnId; blockId: string; quote: string; offset: number; color: HighlightColor; createdAt: number }

/** Private note attached to a block. Never published, never shown to other readers. */
export interface PersonalNote { id: LearnId; lessonId: LearnId; blockId: string; body: string; createdAt: number; updatedAt: number }

export type ProgressState = "not_started" | "in_progress" | "completed";
export interface LessonProgress { lessonId: LearnId; state: ProgressState; lastBlockId?: string; percent: number; updatedAt: number }

/** Concept needing review, from the learning-state backend. The UI only presents it. */
export interface WeakArea { concept: string; lessonId: LearnId; blockId?: string; quizFormId?: string; confidence: number; lastSeenAt: number }

export type ReportReason = "incorrect" | "spam" | "copyright" | "abuse" | "other";
export type ReportTarget = { kind: "lesson" | "comment" | "profile" | "flashcards" | "quiz"; id: LearnId };
export interface ContentReport { id: LearnId; target: ReportTarget; reason: ReportReason; details: string; createdAt: number; status: "open" | "reviewing" | "closed" }

export interface DiscussionComment { id: LearnId; authorId: LearnId; authorName: string; body: string; createdAt: number; editedAt?: number; moderation: ModerationState }
/** A thread is anchored to the whole lesson or to one block, so discussion stays about the material. */
export interface DiscussionThread {
  id: LearnId;
  lessonId: LearnId;
  blockId?: string;
  anchorExcerpt?: string;
  comments: DiscussionComment[];
  resolved: boolean;
  createdAt: number;
}

export interface Flashcard { id: LearnId; front: string; back: string; blockId?: string }
export interface FlashcardSet {
  id: LearnId;
  ownerId: LearnId;
  ownerName: string;
  title: string;
  description: string;
  lessonId?: LearnId;
  cards: Flashcard[];
  visibility: Visibility;
  forkedFrom?: Provenance;
  /** Per-card study state for the current person: 0 = new, higher = known better. */
  createdAt: number;
  updatedAt: number;
}
export interface CardReview { setId: LearnId; cardId: LearnId; box: number; reviewedAt: number }

/** What the backend supports right now. Screens hide or explain controls for missing capabilities instead of showing dead buttons. */
export interface LearnCapabilities {
  /** Public pages reachable by other people and search engines. False for the local store. */
  sharedPublishing: boolean;
  versionRestore: boolean;
  /** In-product AI (tutor, editor actions). The ChatGPT/Claude handoffs work without it. */
  ai: boolean;
  verification: boolean;
  discussions: boolean;
  reports: boolean;
  /** Notes and highlights follow the person across devices. */
  deviceSync: boolean;
  weakAreas: boolean;
  curriculumDirectory: boolean;
  /** Copy a public quiz (with answer keys when the author allows) into the reader’s form library. */
  quizForks: boolean;
}

/** Tutor answers mark every part as grounded in the lesson/sources or as additional explanation. */
export type Grounding = "lesson" | "source" | "general";
export interface TutorPart { text: string; grounding: Grounding; blockId?: string; sourceId?: LearnId; locator?: string }
export interface TutorMessage { id: LearnId; role: "user" | "tutor"; parts: TutorPart[]; createdAt: number; selection?: string }

export type AiAction = "explain" | "simplify" | "expand" | "rewrite" | "organize" | "example" | "quiz";

export interface SearchFilters { q?: string; topic?: string; moduleId?: LearnId; universityId?: LearnId; versionId?: LearnId; creatorId?: LearnId; language?: string; sort?: "relevant" | "recent" | "helpful" }
