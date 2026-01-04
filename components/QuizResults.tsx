'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

import type { Id } from '@/convex/_generated/dataModel';

const QuizResults: React.FC = () => {
    const router = useRouter();
    const searchParams = useSearchParams();

    const quizIdParam = searchParams.get('quizId');
    const score = parseInt(searchParams.get('score') || '0');
    const maxScore = parseInt(searchParams.get('maxScore') || '1');

    const quiz = useQuery(api.quizzes.getQuizById, quizIdParam ? { quizId: quizIdParam as Id<'quizzes'> } : 'skip');

    const percentage = Math.round((score / maxScore) * 100);

    let grade = 'F';
    let color = 'text-red-500';
    if (percentage >= 90) { grade = 'A'; color = 'text-green-400'; }
    else if (percentage >= 80) { grade = 'B'; color = 'text-blue-400'; }
    else if (percentage >= 70) { grade = 'C'; color = 'text-yellow-400'; }
    else if (percentage >= 60) { grade = 'D'; color = 'text-orange-400'; }

    if (!quiz) {
        return (
            <div className="min-h-screen bg-[#111] text-white p-8 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-chaos-accent border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#111] text-white p-4 md:p-8 font-sans">
            <div className="max-w-3xl mx-auto">
                <header className="text-center mb-8 md:mb-12">
                    <h2 className="text-gray-400 uppercase tracking-widest text-xs md:text-sm font-bold mb-4">Performance Report</h2>
                    <h1 className="text-3xl md:text-4xl font-serif mb-2">{quiz.title}</h1>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-8 md:mb-12">
                    {/* Score Card */}
                    <Card className="p-6 md:p-8 flex flex-col items-center justify-center relative overflow-hidden">
                        <div className={`absolute top-0 w-full h-1 ${color.replace('text', 'bg')}`}></div>
                        <div className="text-6xl md:text-8xl font-serif font-bold mb-2 flex items-baseline gap-2">
                            <span className={color}>{percentage}</span>
                            <span className="text-xl md:text-2xl text-gray-500">%</span>
                        </div>
                        <div className="text-lg md:text-xl text-gray-400">
                            Score: {score} / {maxScore}
                        </div>
                    </Card>

                    {/* Stats Card */}
                    <Card className="p-6 md:p-8 flex flex-col justify-center space-y-4 md:space-y-6">
                        <div className="flex items-center justify-between border-b border-[#333] pb-4">
                            <span className="text-gray-400 text-sm md:text-base">Questions</span>
                            <span className="font-mono text-xl">{quiz.questions.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400 text-sm md:text-base">Rank Grade</span>
                            <span className={`font-serif text-2xl font-bold ${color}`}>{grade}</span>
                        </div>
                    </Card>
                </div>

                {/* Question Analysis */}
                <h3 className="text-lg md:text-xl font-medium mb-4 md:mb-6">Question Analysis</h3>
                <div className="space-y-3 md:space-y-4 mb-8 md:mb-12">
                    {quiz.questions.map((q, idx) => {
                        // Mock isCorrect based on percentage for now
                        const isCorrect = Math.random() < (percentage / 100);

                        return (
                            <div
                                key={q.id}
                                className={`p-4 md:p-6 rounded-xl border ${isCorrect ? 'bg-green-900/10 border-green-900/30' : 'bg-red-900/10 border-red-900/30'
                                    }`}
                            >
                                <div className="flex gap-3 md:gap-4">
                                    <span className={`flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center font-bold text-xs md:text-sm ${isCorrect ? 'bg-green-500 text-black' : 'bg-red-500 text-white'
                                        }`}>
                                        {idx + 1}
                                    </span>
                                    <div className="flex-1">
                                        <h4 className="font-medium text-base md:text-lg mb-2">{q.text}</h4>
                                        <p className="text-sm text-gray-400 mb-2">
                                            Answer: <span className="text-white">{q.options[q.correctAnswers[0]]}</span>
                                        </p>
                                        {!isCorrect && <p className="text-sm text-gray-500 italic">{q.explanation}</p>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="flex flex-col md:flex-row justify-center gap-4">
                    <Button onClick={() => router.push('/dashboard')} variant="secondary" size="lg">
                        <Home className="mr-2" size={18} /> Dashboard
                    </Button>
                    <Button onClick={() => router.push(`/${quiz.creatorUsername}/${quiz.slug}`)} size="lg">
                        <RefreshCw className="mr-2" size={18} /> Retry
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default QuizResults;