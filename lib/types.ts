export enum QuestionType {
    MCQ = 'MCQ',
    MULTI_SELECT = 'MULTI_SELECT'
}

export interface User {
    _id: string;
    email: string;
    username: string;
    name: string;
    avatar?: string;
    isCreator: boolean;
}

export interface Question {
    id: string;
    text: string;
    type: QuestionType;
    options: string[]; // Dynamic length, not limited to 4
    correctAnswers: number[];
    explanation: string;
    order: number;
}

export interface Quiz {
    _id: string;
    creatorId: string;
    creatorUsername: string;
    title: string;
    slug: string;
    description: string;
    questions: Question[];
    timeLimitSeconds?: number; // Optional timer
    createdAt: string;
    plays: number;
}

export interface Attempt {
    _id: string;
    quizId: string;
    userId: string;
    score: number;
    maxScore: number;
    timeTakenSeconds: number;
    questionBreakdown: {
        questionId: string;
        timeSpent: number;
        isCorrect: boolean;
        selectedOptions: number[];
    }[];
    completedAt: string;
}

export interface AnalyticsData {
    quizId: string;
    totalAttempts: number;
    averageScore: number;
    highestScore: number;
    hardestQuestions: { questionText: string; failureRate: number }[];
    recentActivity: { date: string; attempts: number }[];
}
