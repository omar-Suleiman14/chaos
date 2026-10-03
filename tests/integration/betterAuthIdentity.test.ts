import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { oidcActorId } from "@/lib/auth/identity";
import { actorForAccount } from "@/convex/authIdentity";

const issuer = "https://backend.example.com";
const oidc = (subject = "person-1", emailVerified = true) => ({ issuer, subject, tokenIdentifier: `${issuer}|${subject}`, name: "Casey", email: "casey@example.com", emailVerified });
function configure() { vi.stubEnv("CHAOS_AUTH_PROVIDER", "betterauth"); vi.stubEnv("CONVEX_SITE_URL", issuer); }
afterEach(() => vi.unstubAllEnvs());

it("namespaces the same provider subject and never joins an existing email account", async () => {
  configure();
  vi.stubEnv("CONVEX_SITE_URL", `${issuer}/`);
  const t = createTestConvex(), owner = t.withIdentity(oidc());
  await t.run(ctx => ctx.db.insert("users", { clerkId: "user_legacy", username: "legacy", name: "Old", email: "casey@example.com", createdAt: 1 }));
  const actor = await oidcActorId(issuer, "person-1");
  expect(await oidcActorId("https://other.example.com", "person-1")).not.toBe(actor);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const user = await owner.query(api.quizFunctions.getCurrentUser, {});
  expect(user?.clerkId).toBe(actor);
  expect((await owner.query(api.authIdentity.resolveCurrent, {}))?.tokenIdentifier).toBe(`chaos|${actor}`);
  expect(await t.query(api.authIdentity.resolveCurrent, {})).toBeNull();
});

it("an operator binding preserves legacy actor, admin ownership, and study identity", async () => {
  configure();
  const t = createTestConvex();
  const oldKey = "https://old.clerk.accounts.dev|user_legacy";
  await t.run(async ctx => {
    await ctx.db.insert("users", { clerkId: "user_legacy", username: "legacy", name: "Old", email: "old@example.com", createdAt: 1 });
    await ctx.db.insert("admins", { clerkId: "user_legacy", email: "old@example.com", grantedAt: 1 });
  });
  const input = { issuer, subject: "person-1", legacyActorId: "user_legacy", legacyTokenIdentifier: oldKey };
  await t.mutation(internal.authIdentity.bindLegacyAccount, input);
  await t.mutation(internal.authIdentity.bindLegacyAccount, input);
  const owner = t.withIdentity(oidc());
  expect(await owner.query(api.authIdentity.resolveCurrent, {})).toEqual({ actorId: "user_legacy", tokenIdentifier: oldKey });
  expect((await owner.query(api.quizFunctions.getCurrentUser, {}))?.username).toBe("legacy");
  expect(await t.run(ctx => actorForAccount(ctx, "user_legacy"))).toEqual({ subject: "user_legacy", tokenIdentifier: oldKey });
  expect(await t.query(internal.authIdentity.resolveTransportActor, { externalActorId: await oidcActorId(issuer, "person-1") })).toBe("user_legacy");
  await expect(t.mutation(internal.authIdentity.bindLegacyAccount, { ...input, subject: "person-2" })).rejects.toThrow("already bound");
  await expect(t.withIdentity({ ...oidc(), issuer: "https://evil.example.com" }).query(api.authIdentity.resolveCurrent, {})).rejects.toThrow("Untrusted identity issuer");
});

it("refuses late merges, unknown accounts, and mappings for another issuer", async () => {
  configure();
  const t = createTestConvex(), owner = t.withIdentity(oidc());
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await t.run(ctx => ctx.db.insert("users", { clerkId: "user_legacy", username: "legacy", name: "Old", email: "old@example.com", createdAt: 1 }));
  const input = { issuer, subject: "person-1", legacyActorId: "user_legacy", legacyTokenIdentifier: "https://old.example.com|user_legacy" };
  await expect(t.mutation(internal.authIdentity.bindLegacyAccount, input)).rejects.toThrow("manual reconciliation");
  await expect(t.mutation(internal.authIdentity.bindLegacyAccount, { ...input, subject: "other", legacyActorId: "missing", legacyTokenIdentifier: "https://old.example.com|missing" })).rejects.toThrow("not found");
  await expect(t.mutation(internal.authIdentity.bindLegacyAccount, { ...input, issuer: "https://evil.example.com" })).rejects.toThrow("must match");
});

it("Better Auth grants require verified email and preserve owner-only publications", async () => {
  configure();
  const t = createTestConvex(), owner = t.withIdentity(oidc("owner"));
  const inviteIdentity = { ...oidc("invited", false), email: "invite@example.com" };
  const invited = t.withIdentity(inviteIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await invited.mutation(api.quizFunctions.getOrCreateUser, {});
  const lessonId = await owner.mutation(api.lessons.create, { metadata: { title: "Private", description: "", language: "en", tags: [] }, document: { schemaVersion: 1, blocks: [{ id: "p", type: "paragraph", text: "Secret", citations: [], conceptIds: [] }] } });
  await expect(invited.mutation(api.lessons.publish, { lessonId, expectedRevision: 0, visibility: "public" })).rejects.toThrow();
  const formId = await owner.mutation(api.forms.createForm, {});
  await owner.mutation(api.forms.inviteCollaborator, { formId, email: inviteIdentity.email, role: "editor" });
  const row = (await t.run(ctx => ctx.db.query("formCollaborators").collect()))[0];
  await expect(invited.mutation(api.forms.acceptInvite, { collaboratorId: row._id })).rejects.toThrow("UNAUTHORIZED");
  await t.withIdentity({ ...inviteIdentity, emailVerified: true }).mutation(api.forms.acceptInvite, { collaboratorId: row._id });
  expect((await t.run(ctx => ctx.db.get("formCollaborators", row._id)))?.userId).toBe(await oidcActorId(issuer, "invited"));
  const actor = await oidcActorId(issuer, "owner");
  expect(await t.run(ctx => actorForAccount(ctx, actor))).toEqual({ subject: actor, tokenIdentifier: `chaos|${actor}` });
});
