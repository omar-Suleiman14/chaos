import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  activityArgs, activityForActor, contactActivityArgs, contactActivityForActor,
  contentArgs, contentForActor, learningContentArgs, learningContentForActor,
  teamsArgs, teamsForActor, usersArgs, usersForActor,
  moderateContentArgs, moderateContentForActor, moderateUserArgs, moderateUserForActor,
  setContactStagesArgs, setContactStagesForActor,
  completeContactFollowUpArgs, completeContactFollowUpForActor,
} from "./admin";
import { overviewForActor, refreshForActor } from "./adminAnalytics";

// userId is overwritten by the secret-protected HTTP transport, never a tool argument.
const actor = { userId: v.string() };
export const users = internalQuery({ args: { ...usersArgs, ...actor }, handler: (ctx, { userId, ...args }) => usersForActor(ctx, args, userId) });
export const content = internalQuery({ args: { ...contentArgs, ...actor }, handler: (ctx, { userId, ...args }) => contentForActor(ctx, args, userId) });
export const learningContent = internalQuery({ args: { ...learningContentArgs, ...actor }, handler: (ctx, { userId, ...args }) => learningContentForActor(ctx, args, userId) });
export const teams = internalQuery({ args: { ...teamsArgs, ...actor }, handler: (ctx, { userId, ...args }) => teamsForActor(ctx, args, userId) });
export const activity = internalQuery({ args: { ...activityArgs, ...actor }, handler: async (ctx, { userId, ...args }) => ({ activity: await activityForActor(ctx, args, userId) }) });
export const contactActivity = internalQuery({ args: { ...contactActivityArgs, ...actor }, handler: async (ctx, { userId, ...args }) => ({ activity: await contactActivityForActor(ctx, args, userId) }) });
export const overview = internalQuery({ args: actor, handler: async (ctx, { userId }) => ({ overview: await overviewForActor(ctx, userId) }) });
export const refresh = internalMutation({ args: actor, handler: async (ctx, { userId }) => { await refreshForActor(ctx, userId); return { ok: true }; } });
export const moderateContent = internalMutation({ args: { ...moderateContentArgs, ...actor }, handler: async (ctx, { userId, ...args }) => { await moderateContentForActor(ctx, args, userId); return { ok: true }; } });
const { userId: accountId, ...userModeration } = moderateUserArgs;
export const moderateUser = internalMutation({ args: { ...userModeration, accountId, ...actor }, handler: async (ctx, { userId, accountId, ...args }) => { await moderateUserForActor(ctx, { ...args, userId: accountId }, userId); return { ok: true }; } });
export const setContactStages = internalMutation({ args: { ...setContactStagesArgs, ...actor }, handler: async (ctx, { userId, ...args }) => { await setContactStagesForActor(ctx, args, userId); return { ok: true }; } });
export const completeContactFollowUp = internalMutation({ args: { ...completeContactFollowUpArgs, ...actor }, handler: async (ctx, { userId, ...args }) => { await completeContactFollowUpForActor(ctx, args, userId); return { ok: true }; } });
