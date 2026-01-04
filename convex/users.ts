import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';

// Sync Clerk user to Convex (called from client)
export const syncClerkUser = mutation({
    args: {
        clerkUserId: v.string(),
        email: v.string(),
        username: v.optional(v.string()),
        name: v.string(),
        imageUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Check if user already exists by email
        const existingUser = await ctx.db
            .query('users')
            .withIndex('by_email', (q) => q.eq('email', args.email))
            .first();

        if (existingUser) {
            // Update user info
            await ctx.db.patch(existingUser._id, {
                username: args.username || existingUser.username,
                name: args.name,
                avatar: args.imageUrl,
            });
            return existingUser._id;
        }

        // Create new user
        const userId = await ctx.db.insert('users', {
            email: args.email,
            username: args.username || args.email.split('@')[0],
            name: args.name,
            avatar: args.imageUrl,
            isCreator: true,
            passwordHash: '', // Clerk handles auth
        });

        return userId;
    },
});

// Simple hash function (in production, use proper crypto)
// Note: This is a DEMO implementation only
function simpleHash(password: string): string {
    // Use btoa which is available in Cloudflare Workers
    return btoa(password);
}

function verifyPassword(password: string, hash: string): boolean {
    return simpleHash(password) === hash;
}

export const createUser = mutation({
    args: {
        email: v.string(),
        password: v.string(),
        username: v.string(),
        name: v.string(),
    },
    handler: async (ctx, args) => {
        // Check if user exists
        const existing = await ctx.db
            .query('users')
            .withIndex('by_email', (q) => q.eq('email', args.email))
            .first();

        if (existing) {
            throw new Error('User already exists');
        }

        // Check if username is taken
        const existingUsername = await ctx.db
            .query('users')
            .withIndex('by_username', (q) => q.eq('username', args.username))
            .first();

        if (existingUsername) {
            throw new Error('Username already taken');
        }

        const passwordHash = simpleHash(args.password);

        const userId = await ctx.db.insert('users', {
            email: args.email,
            username: args.username,
            name: args.name,
            passwordHash,
            isCreator: true,
        });

        return userId;
    },
});

export const loginUser = query({
    args: {
        email: v.string(),
        password: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query('users')
            .withIndex('by_email', (q) => q.eq('email', args.email))
            .first();

        if (!user || !verifyPassword(args.password, user.passwordHash)) {
            return null;
        }

        // Return user without password hash
        const { passwordHash, ...userWithoutPassword } = user;
        return userWithoutPassword;
    },
});

export const getUserByEmail = query({
    args: { email: v.string() },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query('users')
            .withIndex('by_email', (q) => q.eq('email', args.email))
            .first();

        if (!user) return null;

        const { passwordHash, ...userWithoutPassword } = user;
        return userWithoutPassword;
    },
});

export const getUserByUsername = query({
    args: { username: v.string() },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query('users')
            .withIndex('by_username', (q) => q.eq('username', args.username))
            .first();

        if (!user) return null;

        const { passwordHash, ...userWithoutPassword } = user;
        return userWithoutPassword;
    },
});

export const getUserById = query({
    args: { userId: v.id('users') },
    handler: async (ctx, args) => {
        const user = await ctx.db.get(args.userId);

        if (!user) return null;

        const { passwordHash, ...userWithoutPassword } = user;
        return userWithoutPassword;
    },
});

export const updateUser = mutation({
    args: {
        userId: v.id('users'),
        name: v.optional(v.string()),
        avatar: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { userId, ...updates } = args;
        await ctx.db.patch(userId, updates);
        return userId;
    },
});

// Internal mutations for Clerk webhook (optional - for future use)
export const upsertFromClerk = internalMutation({
    args: {
        clerkUserId: v.string(),
        email: v.string(),
        username: v.string(),
        name: v.string(),
        avatar: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existingUser = await ctx.db
            .query('users')
            .withIndex('by_email', (q) => q.eq('email', args.email))
            .first();

        if (existingUser) {
            await ctx.db.patch(existingUser._id, {
                username: args.username,
                name: args.name,
                avatar: args.avatar,
            });
            return existingUser._id;
        } else {
            const userId = await ctx.db.insert('users', {
                email: args.email,
                username: args.username,
                name: args.name,
                avatar: args.avatar,
                isCreator: true,
                passwordHash: '',
            });
            return userId;
        }
    },
});

export const deleteFromClerk = internalMutation({
    args: {
        clerkUserId: v.string(),
    },
    handler: async (_ctx, args) => {
        console.log(`User deletion requested for Clerk ID: ${args.clerkUserId}`);
    },
});
