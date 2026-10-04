import { defineApp } from "convex/server";
import betterAuth from "./betterAuth/convex.config";
import { v } from "convex/values";

// Typed deployment environment variables, read through `env` from ./_generated/server.
const app = defineApp({
  env: {
    /** Public app origin used to build links, e.g. https://chaos.fail. */
    CHAOS_APP_URL: v.optional(v.string()),
    /** Support address shown in error messages (default: the hosted instance's address). */
    CHAOS_SUPPORT_EMAIL: v.optional(v.string()),
    /** Shared secret between the Next.js /mcp route and the Convex MCP endpoint (32+ random bytes). */
    CHAOS_MCP_SECRET: v.optional(v.string()),
    /** Encrypts webhook signing secrets at rest (32+ random characters). Webhooks are off without it. */
    CHAOS_WEBHOOK_KEY: v.optional(v.string()),
    /** "1" lets webhooks target http://localhost for local development. Never set it in production. */
    CHAOS_WEBHOOK_ALLOW_LOCALHOST: v.optional(v.string()),
    /** Integration API reads allowed per connection per minute (default 300). globalConfig overrides it. */
    CHAOS_API_READ_RATE_PER_MINUTE: v.optional(v.string()),
    /** Integration API writes allowed per connection per minute (default 60). globalConfig overrides it. */
    CHAOS_API_WRITE_RATE_PER_MINUTE: v.optional(v.string()),
    /** IndexNow key (8-128 of a-z, A-Z, 0-9, -). Same value as the Next.js INDEXNOW_KEY. Unset disables submissions. */
    INDEXNOW_KEY: v.optional(v.string()),
  },
});

app.use(betterAuth);
export default app;
