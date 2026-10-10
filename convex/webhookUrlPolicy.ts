import { env } from "./_generated/server";
import { checkWebhookUrl } from "./webhookUrl";

const URL_ERRORS: Record<string, string> = {
  invalid_url: "INVALID_URL: Enter a full web address, such as https://example.com/hooks/chaos.",
  too_long: "INVALID_URL: This address is too long.",
  https_required: "INVALID_URL: Use an https:// address.",
  credentials_not_allowed: "INVALID_URL: Remove the user name or password from the address.",
  port_not_allowed: "INVALID_URL: Use port 443 or a port above 1023.",
  ip_literal: "INVALID_URL: Use a host name, not an IP address.",
  internal_hostname: "INVALID_URL: This address points to a private or internal network.",
};

export function allowLocalhost(): boolean {
  return env.CHAOS_WEBHOOK_ALLOW_LOCALHOST === "1";
}

export function validUrl(raw: string): string {
  const check = checkWebhookUrl(raw, { allowLocalhost: allowLocalhost() });
  if (!check.ok) throw new Error(URL_ERRORS[check.code] ?? URL_ERRORS.invalid_url);
  return check.url.toString();
}

