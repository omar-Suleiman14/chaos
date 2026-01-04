import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

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
