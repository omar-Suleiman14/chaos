import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { emptyDefinition } from "@/convex/formLogic";
import { MAX_RETAINED_ALIASES, RELEASED_ALIAS_GRACE_MS, USERNAME_CHANGE_LIMIT, USERNAME_CHANGE_WINDOW_MS } from "@/convex/usernameModel";

function definition() {
  const def = emptyDefinition("Application form");
  def.fields = [{ id: "name", type: "text", label: "Your name", required: true }];
  return def;
}

async function setup() {
  const t = createTestConvex();
  // No nickname, so sign-up gives the generated "userNNNNN" username.
  const owner = t.withIdentity({ ...creatorIdentity, nickname: undefined });
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: definition() });
  return { t, owner, formId };
}

describe("custom links", () => {
  it("asks for a username only when a custom link is wanted", async () => {
    const { owner, formId } = await setup();
    expect(await owner.query(api.links.getMyLinkIdentity, {})).toMatchObject({ chosen: false });
    await expect(owner.mutation(api.links.setFormSlug, { formId, slug: "apply" })).rejects.toThrow(/USERNAME_REQUIRED/);

    await owner.mutation(api.links.chooseUsername, { username: "Omar" });
    expect(await owner.query(api.links.getMyLinkIdentity, {})).toEqual({ username: "omar", chosen: true });
    expect(await owner.mutation(api.links.setFormSlug, { formId, slug: "My Application!" })).toBe("my-application");

    const shareId = (await owner.query(api.forms.getFormForEditor, { formId }))!.shareId;
    expect(await owner.query(api.links.resolveLink, { username: "omar", slug: "my-application" })).toEqual({ shareId });
    expect(await owner.query(api.links.resolveLink, { username: "omar", slug: "nope" })).toBeNull();
  });

  it("rejects reserved or taken usernames and duplicate links", async () => {
    const { t, owner, formId } = await setup();
    await expect(owner.mutation(api.links.chooseUsername, { username: "dashboard" })).rejects.toThrow(/INVALID_USERNAME/);
    await owner.mutation(api.links.chooseUsername, { username: "omar" });

    const other = t.withIdentity({ ...otherCreatorIdentity, nickname: undefined });
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    await expect(other.mutation(api.links.chooseUsername, { username: "omar" })).rejects.toThrow(/USERNAME_TAKEN/);

    await owner.mutation(api.links.setFormSlug, { formId, slug: "apply" });
    const second = await owner.mutation(api.forms.createForm, { definition: definition() });
    await expect(owner.mutation(api.links.setFormSlug, { formId: second, slug: "apply" })).rejects.toThrow(/SLUG_TAKEN/);
    // Only the owner can set a link.
    await expect(other.mutation(api.links.setFormSlug, { formId, slug: "mine" })).rejects.toThrow();
  });

  it("keeps all custom links working across repeated renames and can remove a slug", async () => {
    const { owner, formId } = await setup();
    await owner.mutation(api.links.chooseUsername, { username: "omar" });
    await owner.mutation(api.links.setFormSlug, { formId, slug: "apply" });
    await owner.mutation(api.links.chooseUsername, { username: "omar.s" });
    expect(await owner.query(api.links.resolveLink, { username: "omar.s", slug: "apply" })).not.toBeNull();
    expect(await owner.query(api.links.resolveLink, { username: "omar", slug: "apply" })).not.toBeNull();
    await owner.mutation(api.quizFunctions.setUsername, { username: "omar-final" });
    expect(await owner.query(api.links.resolveLink, { username: "omar.s", slug: "apply" })).not.toBeNull();
    expect(await owner.query(api.links.resolveLink, { username: "omar-final", slug: "apply" })).not.toBeNull();

    await owner.mutation(api.links.setFormSlug, { formId, slug: null });
    expect(await owner.query(api.links.resolveLink, { username: "omar.s", slug: "apply" })).toBeNull();
  });

  it("keeps a chosen username when the sign-in nickname differs", async () => {
    const t = createTestConvex();
    const owner = t.withIdentity({ ...creatorIdentity, nickname: "clerkname" });
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    await owner.mutation(api.links.chooseUsername, { username: "omar" });
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    expect(await owner.query(api.links.getMyLinkIdentity, {})).toEqual({ username: "omar", chosen: true });
  });

  it("never lets anyone use claude or chatgpt, and moves an existing holder to a generated name", async () => {
    const { t, owner } = await setup();
    for (const username of ["claude", "chatgpt", "Claude"]) {
      await expect(owner.mutation(api.links.chooseUsername, { username })).rejects.toThrow(/INVALID_USERNAME/);
    }
    // An account that took "claude" before it became a page.
    const holder = await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject)).unique())!;
      await ctx.db.patch("users", user._id, { username: "claude", usernameChosen: true });
      await ctx.db.insert("usernameAliases", { username: "claude", ownerId: user.clerkId, createdAt: Date.now() });
      return user._id;
    });
    expect(await t.mutation(internal.links.releaseReservedUsernames, { dryRun: true })).toEqual({ changed: 1, changedIds: [holder] });
    expect(await owner.query(api.links.getMyLinkIdentity, {})).toMatchObject({ username: "claude" });
    await t.mutation(internal.links.releaseReservedUsernames, { dryRun: false });
    const after = await owner.query(api.links.getMyLinkIdentity, {});
    expect(after).toMatchObject({ chosen: false });
    expect(after!.username).toMatch(/^user\d{5}$/);
    expect(await t.run((ctx) => ctx.db.query("usernameAliases").withIndex("by_username", (q) => q.eq("username", "claude")).unique())).toBeNull();
  });

  it("releases an old username that never appeared in a public link after the grace period", async () => {
    const { t, owner } = await setup();
    await owner.mutation(api.links.chooseUsername, { username: "alice" });
    await owner.mutation(api.links.chooseUsername, { username: "alice2" });
    const other = t.withIdentity({ ...otherCreatorIdentity, nickname: undefined });
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    // During the grace period the old name still belongs to its owner.
    await expect(other.mutation(api.links.chooseUsername, { username: "alice" })).rejects.toThrow(/USERNAME_TAKEN/);

    await t.run(async (ctx) => {
      const alias = (await ctx.db.query("usernameAliases").withIndex("by_username", (q) => q.eq("username", "alice")).unique())!;
      expect(alias.expiresAt).toBeGreaterThan(Date.now() + RELEASED_ALIAS_GRACE_MS - 60_000);
      await ctx.db.patch("usernameAliases", alias._id, { expiresAt: Date.now() - 1 });
    });
    // Expired: free to take before the cron runs, and the cron removes leftovers.
    expect(await other.mutation(api.links.chooseUsername, { username: "alice" })).toBe("alice");
    await t.mutation(internal.crons.cleanup, {});
    const alias = await t.run((ctx) => ctx.db.query("usernameAliases").withIndex("by_username", (q) => q.eq("username", "alice")).unique());
    expect(alias).toMatchObject({ ownerId: otherCreatorIdentity.subject });
    expect(alias!.expiresAt).toBeUndefined();
  });

  it("keeps an old username that appeared in a public link permanently", async () => {
    const { t, owner, formId } = await setup();
    await owner.mutation(api.links.chooseUsername, { username: "bob" });
    await owner.mutation(api.links.setFormSlug, { formId, slug: "apply" });
    await owner.mutation(api.links.chooseUsername, { username: "bob2" });
    const alias = await t.run((ctx) => ctx.db.query("usernameAliases").withIndex("by_username", (q) => q.eq("username", "bob")).unique());
    expect(alias!.expiresAt).toBeUndefined();
    // Switching back makes a released-pending name permanent again.
    await t.run(async (ctx) => {
      const generated = (await ctx.db.query("usernameAliases").withIndex("by_ownerId", (q) => q.eq("ownerId", creatorIdentity.subject)).collect()).find((a) => /^user\d{5}$/.test(a.username))!;
      // The generated name was left before any custom link existed.
      expect(generated.expiresAt).toBeDefined();
    });
  });

  it("rate limits username changes", async () => {
    const { t, owner } = await setup();
    for (let i = 0; i < USERNAME_CHANGE_LIMIT; i++) await owner.mutation(api.links.chooseUsername, { username: `carol${i}` });
    await expect(owner.mutation(api.links.chooseUsername, { username: "carol-next" })).rejects.toThrow(/USERNAME_CHANGE_LIMIT/);
    // Choosing the current name again is not a change.
    expect(await owner.mutation(api.links.chooseUsername, { username: `carol${USERNAME_CHANGE_LIMIT - 1}` })).toBe(`carol${USERNAME_CHANGE_LIMIT - 1}`);
    // Card customisation shares the limit.
    await expect(owner.mutation(api.memberCards.customizeCard, { username: "carol-card" })).rejects.toThrow(/USERNAME_CHANGE_LIMIT/);
    await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", creatorIdentity.subject)).unique())!;
      await ctx.db.patch("users", user._id, { usernameChangedAt: user.usernameChangedAt!.map((at) => at - USERNAME_CHANGE_WINDOW_MS) });
    });
    expect(await owner.mutation(api.links.chooseUsername, { username: "carol-next" })).toBe("carol-next");
  });

  it("caps how many old usernames an account keeps", async () => {
    const { t, owner, formId } = await setup();
    await owner.mutation(api.links.chooseUsername, { username: "dana" });
    await owner.mutation(api.links.setFormSlug, { formId, slug: "apply" });
    // Retained names from earlier changes, seeded directly so the rate limit does not interfere.
    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_RETAINED_ALIASES; i++) await ctx.db.insert("usernameAliases", { username: `dana-old${i}`, ownerId: creatorIdentity.subject, createdAt: Date.now() });
    });
    await expect(owner.mutation(api.links.chooseUsername, { username: "dana-new" })).rejects.toThrow(/USERNAME_ALIAS_LIMIT/);
    // Moving back to a name already kept adds nothing and is allowed.
    expect(await owner.mutation(api.links.chooseUsername, { username: "dana-old0" })).toBe("dana-old0");
  });
});
