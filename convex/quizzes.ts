import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const createQuiz = mutation({
    args: {
        creatorId: v.id('users'),
        creatorUsername: v.string(),
        title: v.string(),
        slug: v.string(),
        description: v.string(),
        questions: v.array(
            v.object({
                id: v.string(),
                text: v.string(),
                type: v.union(v.literal('MCQ'), v.literal('MULTI_SELECT')),
                options: v.array(v.string()),
                correctAnswers: v.array(v.number()),
                explanation: v.string(),
                order: v.number(),
            })
        ),
        timeLimitSeconds: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const quizId = await ctx.db.insert('quizzes', {
            ...args,
            createdAt: new Date().toISOString(),
            plays: 0,
        });

        return quizId;
    },
});

export const getQuizBySlug = query({
    args: {
        username: v.string(),
        slug: v.string(),
    },
    handler: async (ctx, args) => {
        const quiz = await ctx.db
            .query('quizzes')
            .withIndex('by_creator_and_slug', (q) =>
                q.eq('creatorUsername', args.username).eq('slug', args.slug)
            )
            .first();

        return quiz;
    },
});

export const getQuizById = query({
    args: { quizId: v.id('quizzes') },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.quizId);
    },
});

export const getUserQuizzes = query({
    args: { userId: v.id('users') },
    handler: async (ctx, args) => {
        const quizzes = await ctx.db
            .query('quizzes')
            .withIndex('by_creator', (q) => q.eq('creatorId', args.userId))
            .collect();

        return quizzes.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    },
});

export const incrementPlays = mutation({
    args: { quizId: v.id('quizzes') },
    handler: async (ctx, args) => {
        const quiz = await ctx.db.get(args.quizId);
        if (!quiz) throw new Error('Quiz not found');

        await ctx.db.patch(args.quizId, {
            plays: quiz.plays + 1,
        });
    },
});

export const deleteQuiz = mutation({
    args: { quizId: v.id('quizzes') },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.quizId);
    },
});

export const updateQuiz = mutation({
    args: {
        quizId: v.id('quizzes'),
        title: v.string(),
        slug: v.string(),
        description: v.string(),
        questions: v.array(
            v.object({
                id: v.string(),
                text: v.string(),
                type: v.union(v.literal('MCQ'), v.literal('MULTI_SELECT')),
                options: v.array(v.string()), // Dynamic length
                correctAnswers: v.array(v.number()),
                explanation: v.string(),
                order: v.number(),
            })
        ),
        timeLimitSeconds: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const { quizId, ...updates } = args;
        await ctx.db.patch(quizId, updates);
    },
});
