import { describe, expect, it } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import { emptyDefinition } from "@/convex/formLogic";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

async function setup() {
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  const id = await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await owner.mutation(api.links.chooseUsername, { username: "casey" });
  return { t, owner, id };
}

describe("card identity and public privacy", () => {
  it("preserves existing cardStyle values and accepts accounts without the optional field", async () => {
    const { t, owner, id } = await setup();
    expect((await owner.query(api.memberCards.mine, {}))?.style).toBe(0);
    await t.run(ctx => ctx.db.patch("users", id, { cardStyle: 1 }));
    expect((await owner.query(api.memberCards.mine, {}))?.style).toBe(1);
    expect((await t.query(api.memberCards.byUsername, { username: "casey" }))?.style).toBe(1);
  });
  it("returns only public fields and hides missing, invalid, banned and suspended accounts", async () => {
    const { t, id } = await setup();
    const card = await t.query(api.memberCards.byUsername, { username: " CASEY " });
    expect(Object.keys(card!).sort()).toEqual(["memberSince", "name", "seed", "style", "username"]);
    for (const username of ["%", "missing", "x".repeat(65), "casey/anything"]) {
      expect(await t.query(api.memberCards.byUsername, { username })).toBeNull();
    }
    await t.run((ctx) => ctx.db.patch("users", id, { isBanned: true }));
    expect(await t.query(api.memberCards.byUsername, { username: "casey" })).toBeNull();
    await t.run((ctx) => ctx.db.patch("users", id, { isBanned: false, suspendedUntil: 1 }));
    expect(await t.query(api.memberCards.byUsername, { username: "casey" })).toBeNull();
  });

  it("validates both native setters and requires an authenticated owner", async () => {
    const { t, owner } = await setup();
    for (const mutation of [api.links.chooseUsername, api.quizFunctions.setUsername]) {
      for (const username of ["card", "docs", "pricing", "dashboard", "user12345", "x".repeat(65), "bad name", "%"]) {
        await expect(owner.mutation(mutation, { username })).rejects.toThrow(/INVALID_USERNAME/);
      }
      await expect(t.mutation(mutation, { username: "another" })).rejects.toThrow();
    }
    const other = t.withIdentity(otherCreatorIdentity);
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    await expect(other.mutation(api.links.chooseUsername, { username: "casey" })).rejects.toThrow(/USERNAME_TAKEN/);
    expect(await owner.query(api.links.getMyLinkIdentity, {})).toMatchObject({ username: "casey" });
  });

  it("preserves historical quiz rows and prevents another creator claiming their old routing name", async () => {
    const { t, owner } = await setup();
    const quizId = await t.run((ctx) => ctx.db.insert("quizzes", {
      title: "History", creatorId: creatorIdentity.subject, creatorUsername: "casey", slug: "history",
      isPublished: false, createdAt: 1, updatedAt: 1,
    }));
    const before = await t.run((ctx) => ctx.db.get("quizzes", quizId));
    await owner.mutation(api.quizFunctions.setUsername, { username: "casey-new" });
    expect(await t.run((ctx) => ctx.db.get("quizzes", quizId))).toEqual(before);
    await owner.mutation(api.quizFunctions.getOrCreateUser, {});
    expect(await owner.query(api.links.getMyLinkIdentity, {})).toMatchObject({ username: "casey-new" });
    const other = t.withIdentity(otherCreatorIdentity);
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    await expect(other.mutation(api.links.chooseUsername, { username: "casey" })).rejects.toThrow(/USERNAME_TAKEN/);
  });

  it("reserves every alias across renames, resolves directly to the current card and supports returning to an owned alias", async () => {
    const { t, owner } = await setup();
    await owner.mutation(api.links.chooseUsername, { username: "casey-two" });
    await owner.mutation(api.quizFunctions.setUsername, { username: "casey-three" });
    for (const username of ["casey", "casey-two", "casey-three"]) {
      expect(await t.query(api.memberCards.byUsername, { username })).toMatchObject({ username: "casey-three" });
    }
    const other = t.withIdentity({ ...otherCreatorIdentity, nickname: "casey" });
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    for (const username of ["casey", "casey-two", "casey-three"]) {
      await expect(other.mutation(api.quizFunctions.setUsername, { username })).rejects.toThrow(/USERNAME_TAKEN/);
    }
    await owner.mutation(api.links.chooseUsername, { username: "casey" });
    expect(await t.query(api.memberCards.byUsername, { username: "casey-two" })).toMatchObject({ username: "casey" });
  });

  it("provider sync never changes or steals a historical username, and aliases retain moderation", async () => {
    const { t, owner, id } = await setup();
    await owner.mutation(api.links.chooseUsername, { username: "casey-new" });
    const other = t.withIdentity({ ...otherCreatorIdentity, nickname: "casey" });
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    const before = await other.query(api.links.getMyLinkIdentity, {});
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    expect(await other.query(api.links.getMyLinkIdentity, {})).toEqual(before);
    await t.withIdentity({ ...creatorIdentity, nickname: "rival" }).mutation(api.quizFunctions.getOrCreateUser, {});
    expect(await owner.query(api.links.getMyLinkIdentity, {})).toMatchObject({ username: "casey-new" });
    await t.run((ctx) => ctx.db.patch("users", id, { isBanned: true }));
    expect(await t.query(api.memberCards.byUsername, { username: "casey" })).toBeNull();
    expect(await t.query(api.memberCards.byUsername, { username: "casey-new" })).toBeNull();
  });

  it("does not free historical aliases when the owner row is deleted", async () => {
    const { t, owner, id } = await setup();
    await owner.mutation(api.links.chooseUsername, { username: "casey-new" });
    await t.run((ctx) => ctx.db.delete("users", id));
    const other = t.withIdentity(otherCreatorIdentity);
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    await expect(other.mutation(api.links.chooseUsername, { username: "casey" })).rejects.toThrow(/USERNAME_TAKEN/);
    expect(await t.query(api.memberCards.byUsername, { username: "casey" })).toBeNull();
  });

  it("backfills pre-existing quiz route names in bounded pages and keeps reservations after quiz deletion", async () => {
    const { t, owner } = await setup();
    await t.run(async (ctx) => {
      for (let n = 0; n < 103; n++) await ctx.db.insert("quizzes", {
        title: "Private history", creatorId: creatorIdentity.subject, creatorUsername: `old-name-${n}`, slug: "history",
        isPublished: false, createdAt: 1, updatedAt: 1,
      });
    });
    let cursor: string | null = null;
    let processed = 0;
    let pages = 0;
    for (;;) {
      const result: { cursor: string; done: boolean; processed: number } = await t.mutation(internal.links.backfillUsernameAliases, { phase: "quizzes", cursor });
      expect(result.processed).toBeLessThanOrEqual(100);
      processed += result.processed; pages++;
      if (result.done) break;
      cursor = result.cursor;
    }
    expect(processed).toBe(103); expect(pages).toBe(2);
    await owner.mutation(api.links.chooseUsername, { username: "casey-new" });
    expect(await t.query(api.memberCards.byUsername, { username: "old-name-102" })).toMatchObject({ username: "casey-new" });
    const quiz = await t.run((ctx) => ctx.db.query("quizzes").withIndex("by_creator_slug", (q) => q.eq("creatorUsername", "old-name-102")).first());
    await t.run((ctx) => ctx.db.delete("quizzes", quiz!._id));
    const other = t.withIdentity(otherCreatorIdentity);
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    await expect(other.mutation(api.links.chooseUsername, { username: "old-name-102" })).rejects.toThrow(/USERNAME_TAKEN/);
  });

  it("old card and custom form aliases never disclose private drafts or respondent data", async () => {
    const { t, owner } = await setup();
    const formId = await owner.mutation(api.forms.createForm, { definition: emptyDefinition("Private draft title") });
    await owner.mutation(api.links.setFormSlug, { formId, slug: "private-draft" });
    await owner.mutation(api.links.chooseUsername, { username: "casey-new" });
    const link = await t.query(api.links.resolveLink, { username: "casey", slug: "private-draft" });
    expect(link).not.toBeNull();
    expect(await t.query(api.respond.getPublicForm, { shareId: link!.shareId })).toEqual({ state: "unavailable" });
    const card = await t.query(api.memberCards.byUsername, { username: "casey" });
    expect(Object.keys(card!).sort()).toEqual(["memberSince", "name", "seed", "style", "username"]);
    expect(JSON.stringify(card)).not.toContain("Private draft title");
  });
});
