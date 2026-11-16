import { defineTable } from "convex/server";
import { v } from "convex/values";

export const pushTables = {
  pushSubscriptions: defineTable({
    ownerId: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    locale: v.union(v.literal("en"), v.literal("ar")),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** Bounded receipt history prevents repeat sends on scheduled retries. */
    delivered: v.array(v.string()),
  }).index("by_endpoint", ["endpoint"])
    .index("by_owner", ["ownerId"])
    .index("by_updatedAt", ["updatedAt"]),
};

/** Never allow arbitrary browser-provided URLs to turn web push into an SSRF proxy. */
export function allowedPushEndpoint(raw: string): boolean {
  try {
    if (raw.length > 2048) return false;
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return false;
    const host = url.hostname.toLowerCase();
    return host === "fcm.googleapis.com" ||
      host === "updates.push.services.mozilla.com" ||
      host === "push.services.mozilla.com" ||
      host === "web.push.apple.com" ||
      host.endsWith(".push.apple.com") ||
      host === "wns.windows.com" ||
      host.endsWith(".notify.windows.com");
  } catch { return false; }
}

export function validWebPushKey(value: string, maxLength: number): boolean {
  return value.length >= 20 && value.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(value);
}
