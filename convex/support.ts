import { env } from "./_generated/server";

/** Where people are told to write for help. Self-hosted instances set CHAOS_SUPPORT_EMAIL. */
export function supportEmail(): string {
  return env.CHAOS_SUPPORT_EMAIL?.trim() || "khomod14@gmail.com";
}
