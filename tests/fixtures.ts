/**
 * Shared test fixtures.
 *
 * Every test file that needs a creator, a respondent, a quiz or a question
 * should import from here rather than inlining its own shape, so a schema
 * change only needs updating in one place.
 */

export const creatorIdentity = {
  subject: "user_creator_1",
  issuer: "https://chaos.test.clerk.accounts.dev",
  tokenIdentifier: "https://chaos.test.clerk.accounts.dev|user_creator_1",
  email: "creator@example.com",
  name: "Casey Creator",
  nickname: "creator",
};

/** A second, distinct creator — used to test cross-creator authorization failures. */
export const otherCreatorIdentity = {
  subject: "user_creator_2",
  issuer: "https://chaos.test.clerk.accounts.dev",
  tokenIdentifier: "https://chaos.test.clerk.accounts.dev|user_creator_2",
  email: "other-creator@example.com",
  name: "Riley Rival",
  nickname: "rival",
};

/** Anonymous respondents never authenticate — they are identified by a display name only. */
export const anonymousRespondentName = "Anonymous Respondent";

export const quizFixture = {
  title: "Fixture Quiz",
  slug: "fixture-quiz",
  isPublished: true,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

type NewQuestion = {
  type: "mcq" | "true_false" | "multi_select" | "written";
  questionText: string;
  options?: string[];
  correctAnswer?: string;
  correctAnswers?: string[];
  keywords?: string[];
  explanation?: string;
  points: number;
  order: number;
};

/** One question of each of the four supported types, in a fixed, stable order. */
export const questionFixtures: Record<
  "mcq" | "trueFalse" | "multiSelect" | "written",
  NewQuestion
> = {
  mcq: {
    type: "mcq",
    questionText: "What is 2 + 2?",
    options: ["3", "4", "5", "6"],
    correctAnswer: "4",
    explanation: "2 + 2 = 4.",
    points: 10,
    order: 0,
  },
  trueFalse: {
    type: "true_false",
    questionText: "The sky is blue on a clear day.",
    correctAnswer: "true",
    explanation: "Rayleigh scattering makes the sky appear blue.",
    points: 10,
    order: 1,
  },
  multiSelect: {
    type: "multi_select",
    questionText: "Select every primary color.",
    options: ["Red", "Yellow", "Blue", "Green"],
    correctAnswers: ["Red", "Yellow", "Blue"],
    explanation: "Red, yellow and blue are the primary colors.",
    points: 10,
    order: 2,
  },
  written: {
    type: "written",
    questionText: "Explain photosynthesis in one sentence.",
    keywords: ["sunlight", "chlorophyll", "glucose"],
    explanation: "Plants convert sunlight into chemical energy using chlorophyll.",
    points: 10,
    order: 3,
  },
};
