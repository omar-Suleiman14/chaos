"use node";

import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildWebPush } from "../lib/push/webPush";

const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000];

/** Scheduled only after the in-app notice commits; at-least-once, deduped per device. */
export const deliver = internalAction({
  args: { notificationId: v.id("notifications"), attempt: v.number() },
  handler: async (ctx, { notificationId, attempt }) => {
    if (!Number.isInteger(attempt) || attempt < 0 || attempt > BACKOFF_MS.length) return;
    const keys = {
      publicKey: env.CHAOS_WEB_PUSH_PUBLIC_KEY || "",
      privateKey: env.CHAOS_WEB_PUSH_PRIVATE_KEY || "",
      subject: env.CHAOS_WEB_PUSH_SUBJECT || "",
    };
    if (!keys.publicKey || !keys.privateKey || !keys.subject) return; // Explicitly disabled until configured.
    const targets = await ctx.runQuery(internal.pushSubscriptions.deliveryTargets, { notificationId });
    let retry = false;
    for (const target of targets) {
      try {
        const request = buildWebPush(target, keys);
        const response = await fetch(request.endpoint, {
          method: "POST", headers: request.headers,
          body: request.body, signal: AbortSignal.timeout(12_000),
          redirect: "error",
        });
        if (response.ok) {
          await ctx.runMutation(internal.pushSubscriptions.markDelivered, { subscriptionId: target.id, notificationId });
        } else if (response.status === 404 || response.status === 410) {
          await ctx.runMutation(internal.pushSubscriptions.removeExpired, { subscriptionId: target.id, endpoint: target.endpoint });
        } else if (response.status === 429 || response.status >= 500) retry = true;
        else console.warn("PUSH_PROVIDER_REJECTED", response.status); // Never log the endpoint or tokens.
      } catch (error) {
        retry = true;
        console.warn("PUSH_TRANSPORT_FAILURE", error instanceof Error ? error.name : "unknown");
      }
    }
    if (retry && attempt < BACKOFF_MS.length)
      await ctx.scheduler.runAfter(BACKOFF_MS[attempt], internal.pushDelivery.deliver, { notificationId, attempt: attempt + 1 });
  },
});
