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
