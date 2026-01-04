import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
    users: defineTable({
        email: v.string(),
        username: v.string(),
        name: v.string(),
        passwordHash: v.string(),
        avatar: v.optional(v.string()),
        isCreator: v.boolean(),
    })
        .index('by_email', ['email'])
        .index('by_username', ['username']),

    quizzes: defineTable({
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
                options: v.array(v.string()), // Dynamic length
                correctAnswers: v.array(v.number()),
                explanation: v.string(),
                order: v.number(),
            })
        ),
        timeLimitSeconds: v.optional(v.number()), // Optional timer
        createdAt: v.string(),
        plays: v.number(),
    })
        .index('by_creator', ['creatorId'])
        .index('by_slug', ['slug'])
        .index('by_creator_and_slug', ['creatorUsername', 'slug']),

    attempts: defineTable({
        quizId: v.id('quizzes'),
        userId: v.string(), // Can be guest or user ID
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
        completedAt: v.string(),
    })
        .index('by_quiz', ['quizId'])
        .index('by_user', ['userId']),
});
