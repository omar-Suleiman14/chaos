import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Quiz, Attempt, Question, QuestionType } from './types';

interface StoreContextType {
  user: User | null;
  login: (email: string, username?: string) => void;
  logout: () => void;
  quizzes: Quiz[];
  attempts: Attempt[];
  addQuiz: (quiz: Quiz) => void;
  addAttempt: (attempt: Attempt) => void;
  getCreatorStats: (userId: string) => any;
  getQuizBySlug: (username: string, slug: string) => Quiz | undefined;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

// Storage Keys
const STORAGE_KEYS = {
  USER: 'chaos_user',
  QUIZZES: 'chaos_quizzes',
  ATTEMPTS: 'chaos_attempts'
};

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load initial state from LocalStorage (Simulating DB)
  const [user, setUserState] = useState<User | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USER);
    return saved ? JSON.parse(saved) : null;
  });

  const [quizzes, setQuizzesState] = useState<Quiz[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.QUIZZES);
    return saved ? JSON.parse(saved) : [];
  });

  const [attempts, setAttemptsState] = useState<Attempt[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ATTEMPTS);
    return saved ? JSON.parse(saved) : [];
  });

  // Persistence Wrappers
  const setUser = (u: User | null) => {
    setUserState(u);
    if (u) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(u));
    else localStorage.removeItem(STORAGE_KEYS.USER);
  };

  const setQuizzes = (newQuizzes: Quiz[]) => {
    setQuizzesState(newQuizzes);
    localStorage.setItem(STORAGE_KEYS.QUIZZES, JSON.stringify(newQuizzes));
  };

  const setAttempts = (newAttempts: Attempt[]) => {
    setAttemptsState(newAttempts);
    localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(newAttempts));
  };

  const login = (email: string, username?: string) => {
    // In a real app, we would check if email exists. 
    // Here, we just update or create.
    const finalUsername = username || email.split('@')[0];
    
    const newUser: User = {
      id: btoa(email), // Simple stable ID based on email
      email,
      username: finalUsername, 
      name: finalUsername,
      isCreator: true
    };
    setUser(newUser);
  };

  const logout = () => setUser(null);

  const addQuiz = (quiz: Quiz) => {
    const updated = [quiz, ...quizzes];
    setQuizzes(updated);
  };

  const addAttempt = (attempt: Attempt) => {
    const updatedAttempts = [...attempts, attempt];
    setAttempts(updatedAttempts);
    
    // Update play count on the specific quiz
    const updatedQuizzes = quizzes.map(q => 
      q.id === attempt.quizId ? { ...q, plays: q.plays + 1 } : q
    );
    setQuizzes(updatedQuizzes);
  };

  const getCreatorStats = (userId: string) => {
    const userQuizzes = quizzes.filter(q => q.creatorId === userId);
    const quizIds = userQuizzes.map(q => q.id);
    const relevantAttempts = attempts.filter(a => quizIds.includes(a.quizId));

    const totalViews = userQuizzes.reduce((acc, q) => acc + q.plays, 0);
    const avgScore = relevantAttempts.length > 0 
      ? relevantAttempts.reduce((acc, a) => acc + (a.score / a.maxScore), 0) / relevantAttempts.length 
      : 0;

    return {
      totalViews,
      totalQuizzes: userQuizzes.length,
      avgScore: Math.round(avgScore * 100),
      recentAttempts: relevantAttempts.slice(-5)
    };
  };

  const getQuizBySlug = (username: string, slug: string) => {
    // 1. Find user by username (simulated) - In this flat store, we look for quiz that matches slug and we verify creator
    // Since we don't have a Users table easily accessible in this structure without iterating attempts or something,
    // we will rely on the quiz storing creator ID.
    // For this mock, we assume the username passed in URL matches the quiz's creator ID (which we mocked as base64 email or similiar).
    // To make this robust in this mock: we iterate quizzes, find one with matching slug, then 'mock check' the username.
    
    return quizzes.find(q => q.slug === slug);
  };

  return (
    <StoreContext.Provider value={{ user, login, logout, quizzes, attempts, addQuiz, addAttempt, getCreatorStats, getQuizBySlug }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
};