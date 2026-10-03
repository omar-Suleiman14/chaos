/** A provider-scoped account key, shared by browser sessions and backend auth. */
export async function oidcActorId(issuer: string, subject: string): Promise<string> {
  if (!issuer || !subject || issuer.includes("|") || subject.includes("|")) {
    throw new Error("Invalid OpenID identity");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${issuer}|${subject}`));
  return `oidc_${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
