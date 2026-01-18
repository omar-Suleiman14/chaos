import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';

export const createAttempt = mutation({
    args: {
        quizId: v.id('quizzes'),
        userId: v.string(),
        score: v.number(),
        maxScore: v.number(),
        timeTakenSeconds: v.number(),
        questionBreakdown: v.array(
            v.object({
                questionId: v.string(),
                timeSpent: v.number(),
                isCorrect: v.boolean(),
                selectedOptions: v.array(v.number()),
            })
        ),
    },
    handler: async (ctx, args) => {
        const attemptId = await ctx.db.insert('attempts', {
            ...args,
            completedAt: new Date().toISOString(),
        });

        return attemptId;
    },
});

export const getQuizAttempts = query({
    args: { quizId: v.id('quizzes') },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('attempts')
            .withIndex('by_quiz', (q) => q.eq('quizId', args.quizId))
            .collect();
    },
});

export const getUserAttempts = query({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('attempts')
            .withIndex('by_user', (q) => q.eq('userId', args.userId))
            .collect();
    },
});

export const getCreatorStats = query({
    args: { userId: v.id('users') },
    handler: async (ctx, args) => {
        const quizzes = await ctx.db
            .query('quizzes')
            .withIndex('by_creator', (q) => q.eq('creatorId', args.userId))
            .collect();

        const totalViews = quizzes.reduce((acc, q) => acc + q.plays, 0);
        const totalQuizzes = quizzes.length;

        const quizIds = quizzes.map((q) => q._id);

        // Get all attempts for user's quizzes
        const allAttempts = await ctx.db.query('attempts').collect();
        const relevantAttempts = allAttempts.filter((a) => quizIds.includes(a.quizId));

        const avgScore =
            relevantAttempts.length > 0
                ? relevantAttempts.reduce((acc, a) => acc + a.score / a.maxScore, 0) /
                relevantAttempts.length
                : 0;

        return {
            totalViews,
            totalQuizzes,
            avgScore: Math.round(avgScore * 100),
            recentAttempts: relevantAttempts.slice(-5),
        };
    },
});

export const getTakenQuizzes = query({
    args: { userId: v.id('users') },
    handler: async (ctx, args) => {
        const attempts = await ctx.db
            .query('attempts')
            .withIndex('by_user', (q) => q.eq('userId', args.userId))
            .collect();

        // Get unique quiz IDs
        const uniqueQuizIds = Array.from(new Set(attempts.map((a) => a.quizId)));

        const quizzes = await Promise.all(
            uniqueQuizIds.map(async (id) => {
                const quiz = await ctx.db.get(id);
                return quiz ? { ...quiz, creatorUsername: quiz.creatorUsername } : null;
            })
        );

        // Filter out nulls (deleted quizzes)
        return quizzes.filter((q) => q !== null);
    },
});

export const deleteAttemptsForQuiz = mutation({
    args: { quizId: v.id('quizzes') },
    handler: async (ctx, args) => {
        const attempts = await ctx.db
            .query('attempts')
            .withIndex('by_quiz', (q) => q.eq('quizId', args.quizId))
            .collect();

        await Promise.all(attempts.map((a) => ctx.db.delete(a._id)));
    },
});

// Get detailed analytics for a specific quiz
export const getQuizAnalytics = query({
    args: { quizId: v.id('quizzes') },
    handler: async (ctx, args) => {
        // Get all attempts for this quiz
        const attempts = await ctx.db
            .query('attempts')
            .withIndex('by_quiz', (q) => q.eq('quizId', args.quizId))
            .collect();

        if (attempts.length === 0) {
            return {
                totalAttempts: 0,
                averageScore: 0,
                leaderboard: [],
                attemptsWithUsers: [],
                questionAnalysis: [],
            };
        }

        // Get quiz details for question count
        const quiz = await ctx.db.get(args.quizId);
        if (!quiz) return null;

        // Get user details for each attempt
        const attemptsWithUsers = await Promise.all(
            attempts.map(async (attempt) => {
                // userId is stored as string (Convex user ID), cast to proper type
                let user: { email?: string; name?: string; avatar?: string } | null = null;
                try {
                    user = await ctx.db.get(attempt.userId as Id<"users">);
                } catch (error) {
                    console.error('Failed to fetch user:', error);
                }

                return {
                    attemptId: attempt._id,
                    userEmail: user?.email || 'Unknown',
                    userName: user?.name || 'Anonymous',
                    userAvatar: user?.avatar,
                    score: attempt.score,
                    maxScore: attempt.maxScore,
                    percentage: Math.round((attempt.score / attempt.maxScore) * 100),
                    timeTaken: attempt.timeTakenSeconds,
                    completedAt: attempt.completedAt,
                    questionBreakdown: attempt.questionBreakdown,
                };
            })
        );

        // Calculate average score
        const averageScore = Math.round(
            (attempts.reduce((acc, a) => acc + a.score / a.maxScore, 0) / attempts.length) * 100
        );

        // Create leaderboard (top scores)
        const leaderboard = attemptsWithUsers
            .sort((a, b) => {
                if (b.percentage === a.percentage) {
                    return a.timeTaken - b.timeTaken; // Faster time wins ties
                }
                return b.percentage - a.percentage;
            })
            .slice(0, 10);

        // Per-question analysis
        const questionMap = new Map<string, { correct: number; total: number; questionIndex: number }>();

        attempts.forEach((attempt) => {
            attempt.questionBreakdown.forEach((qb, index) => {
                if (!questionMap.has(qb.questionId)) {
                    questionMap.set(qb.questionId, { correct: 0, total: 0, questionIndex: index });
                }
                const stats = questionMap.get(qb.questionId)!;
                stats.total++;
                if (qb.isCorrect) stats.correct++;
            });
        });

        const questionAnalysis = Array.from(questionMap.entries())
            .map(([questionId, stats]) => {
                const question = quiz.questions.find(q => q.id === questionId);
                return {
                    questionId,
                    questionText: question?.text || 'Unknown question',
                    questionIndex: stats.questionIndex,
                    correctCount: stats.correct,
                    totalAttempts: stats.total,
                    successRate: Math.round((stats.correct / stats.total) * 100),
                };
            })
            .sort((a, b) => a.questionIndex - b.questionIndex);

        return {
            totalAttempts: attempts.length,
            averageScore,
            leaderboard,
            attemptsWithUsers: attemptsWithUsers.sort((a, b) =>
                new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
            ),
            questionAnalysis,
        };
    },
});

