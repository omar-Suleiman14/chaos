export enum QuestionType {
  MCQ = 'MCQ',
  MULTI_SELECT = 'MULTI_SELECT'
}

export interface User {
  id: string;
  email: string;
  username: string; // Added username
  name: string;
  avatar?: string;
  isCreator: boolean;
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options: string[];
  correctAnswers: number[]; // Indices of correct options
  explanation: string;
}

export interface Quiz {
  id: string;
  creatorId: string;
  title: string;
  slug: string; // Added slug for pretty URLs
  description: string;
  questions: Question[];
  timeLimitSeconds: number; // 0 for no limit
  createdAt: string;
  plays: number;
}

export interface Attempt {
  id: string;
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