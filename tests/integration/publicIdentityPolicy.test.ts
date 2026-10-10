import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { oidcActorId } from "../../lib/auth/identity";
import { creatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());
const betterIssuer = "https://identity.synthetic.example.com";
async function fixture(provider: "clerk" | "betterauth") {
  vi.stubEnv("CHAOS_AUTH_PROVIDER", provider);
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", creatorIdentity.issuer);
  vi.stubEnv("CONVEX_SITE_URL", betterIssuer);
  const t = createTestConvex();
  const identity = provider === "clerk" ? creatorIdentity : { ...creatorIdentity, issuer: betterIssuer, tokenIdentifier: `${betterIssuer}|${creatorIdentity.subject}` };
  const owner = t.withIdentity(identity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const user = (await owner.query(api.quizFunctions.getCurrentUser, {}))!;
  const key = provider === "clerk" ? creatorIdentity.tokenIdentifier : `chaos|${await oidcActorId(betterIssuer, creatorIdentity.subject)}`;
  const now = Date.now();
  const claims = await t.run(async ctx => {
    const result = [];
    for (const [role, duration] of [["educator", 10000], ["student", 20000]] as const) result.push(await ctx.db.insert("learnIdentityClaims", {
      userKey: key, role, status: "verified", method: "manual_review", reviewedBy: "synthetic-reviewer", expiresAt: now + duration,
      institution: "PRIVATE institution", reason: "PRIVATE evidence", createdAt: 0,
    }));
    return result;
  });
  const profile = (username = user.username) => t.query(api.learnFrontend.publicProfile, { username });
  const badges = (username = user.username) => t.query(api.learnStudyReads.publicIdentity, { username });
  return { t, user, now, claims, profile, badges };
}

describe.each(["clerk", "betterauth"] as const)("public identity policy (%s)", provider => {
  it("preserves both payloads, ordering and private-field filtering through expiry", async () => {
    const f = await fixture(provider);
    expect(await f.profile()).toEqual({ username: f.user.username, name: f.user.name, imageUrl: f.user.imageUrl ?? null, verifiedRoles: ["educator", "student"] });
    expect(await f.badges()).toEqual([{ kind: "educator", expiresAt: f.now + 10000 }, { kind: "student", expiresAt: f.now + 20000 }]);
    expect(JSON.stringify([await f.profile(), await f.badges()])).not.toContain("PRIVATE");
    vi.setSystemTime(f.now + 10000);
    expect((await f.profile())?.verifiedRoles).toEqual(["student"]);
    expect(await f.badges()).toEqual([{ kind: "student", expiresAt: f.now + 20000 }]);
    vi.setSystemTime(f.now + 20000);
    expect((await f.profile())?.verifiedRoles).toEqual([]);
    expect(await f.badges()).toEqual([]);
  });

  it("requires reviewed manual verification without admitting invalid or expired claims", async () => {
    const f = await fixture(provider);
    const original = (await f.t.run(ctx => ctx.db.get("learnIdentityClaims", f.claims[0])))!;
    const variants: Partial<Pick<Doc<"learnIdentityClaims">, "status" | "method" | "reviewedBy" | "expiresAt">>[] = [
      { status: "pending" }, { status: "rejected" }, { status: "revoked" },
      { method: undefined }, { reviewedBy: undefined }, { reviewedBy: "" },
      { expiresAt: undefined }, { expiresAt: f.now }, { expiresAt: f.now - 1 },
    ];
    for (const variant of variants) {
      await f.t.run(ctx => ctx.db.patch("learnIdentityClaims", original._id, { status: original.status, method: original.method, reviewedBy: original.reviewedBy, expiresAt: original.expiresAt, ...variant }));
      expect((await f.profile())?.verifiedRoles).toEqual(["student"]);
      expect(await f.badges()).toEqual([{ kind: "student", expiresAt: f.now + 20000 }]);
    }
  });

  it("preserves missing/invalid username responses and creator moderation", async () => {
    const f = await fixture(provider);
    for (const username of ["", "x".repeat(101), "missing", ` ${f.user.username}`]) {
      expect(await f.profile(username)).toBeNull();
      expect(await f.badges(username)).toEqual([]);
    }
    for (const restriction of [{ isBanned: true }, { isBanned: false, suspendedUntil: f.now + 1 }, { suspendedUntil: f.now - 1 }]) {
      await f.t.run(ctx => ctx.db.patch("users", f.user._id, restriction));
      expect(await f.profile()).toBeNull();
      expect(await f.badges()).toEqual([]);
    }
    await f.t.run(ctx => ctx.db.patch("users", f.user._id, { suspendedUntil: undefined }));
    expect((await f.profile())?.verifiedRoles).toEqual(["educator", "student"]);
    await f.t.run(ctx => ctx.db.delete("users", f.user._id));
    expect(await f.profile()).toBeNull();
    expect(await f.badges()).toEqual([]);
  });
});

it("uses the preserved claim identity for an operator-bound Better Auth account", async () => {
  vi.stubEnv("CHAOS_AUTH_PROVIDER", "betterauth");
  vi.stubEnv("CONVEX_SITE_URL", betterIssuer);
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://new.synthetic.clerk.accounts.dev");
  const t = createTestConvex(), expiresAt = Date.now() + 10000;
  await t.run(ctx => ctx.db.insert("users", { clerkId: creatorIdentity.subject, username: creatorIdentity.nickname, name: creatorIdentity.name, email: creatorIdentity.email, createdAt: 0 }));
  await t.mutation(internal.authIdentity.bindLegacyAccount, { issuer: betterIssuer, subject: creatorIdentity.subject, legacyActorId: creatorIdentity.subject, legacyTokenIdentifier: creatorIdentity.tokenIdentifier });
  await t.run(async ctx => {
    for (const [userKey, role] of [[creatorIdentity.tokenIdentifier, "student"], [`chaos|${await oidcActorId(betterIssuer, creatorIdentity.subject)}`, "educator"]] as const) {
      await ctx.db.insert("learnIdentityClaims", { userKey, role, status: "verified", method: "manual_review", reviewedBy: "synthetic-reviewer", expiresAt, institution: "PRIVATE institution", createdAt: 0 });
    }
  });
  expect((await t.query(api.learnFrontend.publicProfile, { username: creatorIdentity.nickname }))?.verifiedRoles).toEqual(["student"]);
  expect(await t.query(api.learnStudyReads.publicIdentity, { username: creatorIdentity.nickname })).toEqual([{ kind: "student", expiresAt }]);
});
