// Pure rules for who may respond and what a response may carry besides answers.
// No Convex imports: the settings UI, the respondent page and the server share them.

/** Hidden fields: URL parameters (e.g. ?source=instagram) stored with a response, never mixed into answers. */
export const HIDDEN_FIELD_LIMITS = { count: 20, name: 40, value: 500 } as const;
const hiddenNamePattern = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
/** Query parameters the respondent page already uses. */
export const reservedParams = ["lang", "embed", "resume", "edit", "score"] as const;

/** Null when `name` can be a hidden field; otherwise why not (English, for the server error). */
export function hiddenFieldNameError(name: string): string | null {
  if (!hiddenNamePattern.test(name)) return `“${name.slice(0, 40)}” is not a valid parameter name. Use letters, digits, - or _, starting with a letter (at most ${HIDDEN_FIELD_LIMITS.name}).`;
  if ((reservedParams as readonly string[]).includes(name.toLowerCase())) return `“${name}” is used by Chaos links. Choose another name.`;
  return null;
}

/** Validated, de-duplicated list of hidden field names; throws INVALID_SETTINGS on bad input. */
export function checkHiddenFieldNames(names: readonly string[]): string[] {
  if (names.length > HIDDEN_FIELD_LIMITS.count) throw new Error(`INVALID_SETTINGS: Use at most ${HIDDEN_FIELD_LIMITS.count} hidden fields.`);
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    const error = hiddenFieldNameError(name);
    if (error) throw new Error(`INVALID_SETTINGS: ${error}`);
    if (seen.has(name.toLowerCase())) throw new Error(`INVALID_SETTINGS: “${name}” is listed twice.`);
    seen.add(name.toLowerCase());
  }
  return names.map((n) => n.trim());
}

/**
 * Keeps only the declared parameters, trimmed, without control characters and capped in length.
 * Unknown names are dropped, so a link can never add fields or overwrite answers.
 */
export function captureHidden(declared: readonly string[] | undefined, input: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!declared?.length || !input) return undefined;
  const out: Record<string, string> = {};
  for (const name of declared) {
    const value = input[name];
    if (typeof value !== "string") continue;
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, HIDDEN_FIELD_LIMITS.value);
    if (clean) out[name] = clean;
  }
  return Object.keys(out).length ? out : undefined;
}

// ── Allowed emails and domains (signed-in forms) ────────────────────────────

export const EMAIL_RULE_LIMITS = { emails: 500, domains: 50 } as const;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const domainPattern = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Lower-cased, trimmed, "@" stripped from domains; throws INVALID_SETTINGS on bad entries. */
export function normalizeEmailRules(emails: readonly string[] | undefined, domains: readonly string[] | undefined) {
  const cleanEmails = [...new Set((emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const cleanDomains = [...new Set((domains ?? []).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))];
  if (cleanEmails.length > EMAIL_RULE_LIMITS.emails) throw new Error(`INVALID_SETTINGS: List at most ${EMAIL_RULE_LIMITS.emails} email addresses.`);
  if (cleanDomains.length > EMAIL_RULE_LIMITS.domains) throw new Error(`INVALID_SETTINGS: List at most ${EMAIL_RULE_LIMITS.domains} domains.`);
  for (const e of cleanEmails) if (e.length > 320 || !emailPattern.test(e)) throw new Error(`INVALID_SETTINGS: “${e.slice(0, 80)}” is not a valid email address.`);
  for (const d of cleanDomains) if (!domainPattern.test(d)) throw new Error(`INVALID_SETTINGS: “${d.slice(0, 80)}” is not a valid domain, e.g. school.edu.`);
  return { emails: cleanEmails, domains: cleanDomains };
}

export function hasEmailRules(settings: { allowedEmails?: string[]; allowedDomains?: string[] }): boolean {
  return !!(settings.allowedEmails?.length || settings.allowedDomains?.length);
}

export type EmailCheck = "ok" | "unverified" | "not_allowed";

/**
 * Whether a signed-in identity may respond. Only a verified email counts; domains match exactly
 * (school.edu does not admit a.school.edu), so a lookalike subdomain cannot slip in.
 */
export function checkEmailRules(
  settings: { allowedEmails?: string[]; allowedDomains?: string[] },
  identity: { email?: string; emailVerified?: boolean } | null,
): EmailCheck {
  if (!hasEmailRules(settings)) return "ok";
  const email = identity?.email?.trim().toLowerCase();
  if (!email || identity?.emailVerified !== true) return "unverified";
  if (settings.allowedEmails?.includes(email)) return "ok";
  const domain = email.slice(email.lastIndexOf("@") + 1);
  return settings.allowedDomains?.includes(domain) ? "ok" : "not_allowed";
}
