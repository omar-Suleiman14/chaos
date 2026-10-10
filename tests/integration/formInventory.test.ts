import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { emptyDefinition } from "../../convex/formLogic";
import { defaultFormSettings } from "../../convex/formModel";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { createTestConvex } from "./setup";

afterEach(() => vi.unstubAllEnvs());

for (const provider of ["clerk", "betterauth"]) {
  for (const emailVerified of [false, true]) {
    it(`preserves owned/shared/invited inventory projections for ${provider}, verified=${emailVerified}`, async () => {
      const t = createTestConvex();
      let identity = { ...otherCreatorIdentity, emailVerified };
      if (provider === "betterauth") {
        const issuer = "https://backend.example.com";
        vi.stubEnv("CHAOS_AUTH_PROVIDER", "betterauth");
        vi.stubEnv("CONVEX_SITE_URL", issuer);
        identity = { ...identity, issuer, subject: "synthetic-provider-subject", tokenIdentifier: `${issuer}|synthetic-provider-subject` };
        const { oidcActorId } = await import("../../lib/auth/identity");
        const externalActorId = await oidcActorId(issuer, identity.subject);
        await t.run(ctx => ctx.db.insert("authIdentityBindings", { externalActorId, actorId: otherCreatorIdentity.subject, tokenIdentifier: otherCreatorIdentity.tokenIdentifier }));
      }
      const ids = await t.run(async ctx => {
        for (const user of [creatorIdentity, otherCreatorIdentity]) await ctx.db.insert("users", { clerkId: user.subject, name: user.name, username: user.nickname, email: user.email, createdAt: 0 });
        const form = async (title: string, updatedAt: number, ownerId = creatorIdentity.subject, status: Doc<"forms">["status"] = "draft") => ctx.db.insert("forms", { ownerId, title, shareId: title, status, draft: { ...emptyDefinition(title), description: `Search ${title}` }, draftRevision: 1, settings: defaultFormSettings, responseCount: 0, partialCount: 0, createdAt: 0, updatedAt });
        const owned = await form("Owned", 10, otherCreatorIdentity.subject);
        const shared = await form("Shared", 20);
        const archived = await form("Archived", 30, creatorIdentity.subject, "archived");
        const pending = await form("Pending", 40);
        const declined = await form("Declined", 50);
        const wrongAccount = await form("Wrong account", 60);
        const unbound = await form("Unbound", 65);
        const missing = await form("Deleted", 70);
        await ctx.db.patch("forms", shared, { publishedVersion: 1, responseCount: 2, partialCount: 1, source: { kind: "integration", label: "Synthetic connector", connectionId: "synthetic-connection" } });
        await ctx.db.insert("formCounters", { formId: shared, ownerId: creatorIdentity.subject, responseCount: 7, partialCount: 3, lastResponseAt: 123 });
        await ctx.db.patch("forms", archived, { publishedVersion: 1, responseCount: 4 });
        const membership = async (formId: Id<"forms">, status: Doc<"formCollaborators">["status"], role: "editor" | "viewer" = "viewer", userId: string | undefined = otherCreatorIdentity.subject) => ctx.db.insert("formCollaborators", { formId, email: otherCreatorIdentity.email, userId, role, status, invitedBy: creatorIdentity.subject, createdAt: 0 });
        await membership(owned, "accepted");
        await membership(shared, "accepted");
        await membership(shared, "accepted", "editor");
        await membership(archived, undefined, "editor");
        const invite = await membership(pending, "pending", "editor");
        await membership(declined, "declined");
        await membership(wrongAccount, "accepted", "editor", "another-account");
        await ctx.db.insert("formCollaborators", { formId: unbound, email: otherCreatorIdentity.email, role: "viewer", invitedBy: creatorIdentity.subject, createdAt: 0 });
        await membership(missing, "accepted");
        await ctx.db.delete("forms", missing);
        return { owned, shared, archived, pending, invite, unbound };
      });
      const native = t.withIdentity(identity);
      const list = await native.query(api.forms.listMyForms, {});
      expect(list.owned.map(row => row._id)).toEqual([ids.owned]);
      expect(list.shared.map(row => [row._id, row.role])).toEqual([[ids.shared, "viewer"], [ids.archived, "editor"], ...(emailVerified ? [[ids.unbound, "viewer"]] : [])]);
      expect(list.shared.every(row => row.ownerName === creatorIdentity.name)).toBe(true);
      expect(list.shared[0]).toMatchObject({ responseCount: 7, partialCount: 3, lastResponseAt: 123, source: { kind: "integration", label: "Synthetic connector", connectionId: "synthetic-connection" } });
      expect(list.shared[1].responseCount).toBe(4);
      expect(list.invites).toEqual(emailVerified ? [{ collaboratorId: ids.invite, formId: ids.pending, title: "Pending", role: "editor", ownerName: creatorIdentity.name, createdAt: 0 }] : []);
      const search = await native.query(api.forms.searchIndex, {});
      expect(search.map(row => row.id)).toEqual([ids.owned, ids.shared, ids.archived, ...(emailVerified ? [ids.pending, ids.unbound] : [])]);
      expect(search.map(row => row.text)).toEqual(["Search Owned", "Search Shared", "Search Archived", ...(emailVerified ? ["Search Pending", "Search Unbound"] : [])]);
      const mcp = await t.query(internal.mcp.searchForms, { userId: otherCreatorIdentity.subject });
      expect(mcp.total).toBe(2);
      expect(mcp.items.map(row => [row.id, row.role])).toEqual([[`form_${ids.shared}`, "viewer"], [`form_${ids.owned}`, "owner"]]);
      expect(mcp.items[0].responseCount).toBe(7);
      const all = await t.query(internal.mcp.searchForms, { userId: otherCreatorIdentity.subject, status: "any" });
      expect(all.items.map(row => row.id)).toEqual([`form_${ids.archived}`, `form_${ids.shared}`, `form_${ids.owned}`]);
      expect(all.items[0].responseCount).toBe(4);
      expect((await t.query(internal.mcp.searchForms, { userId: otherCreatorIdentity.subject, query: "SHARED", limit: 1 })).items.map(row => row.id)).toEqual([`form_${ids.shared}`]);
    });
  }
}

it("retains anonymous result shapes and the existing caller-specific owned bounds", async () => {
  const t = createTestConvex();
  expect(await t.query(api.forms.listMyForms, {})).toEqual({ owned: [], shared: [] });
  expect(await t.query(api.forms.searchIndex, {})).toEqual([]);
  const ids = await t.run(async ctx => {
    const result: Id<"forms">[] = [];
    for (let i = 0; i < 501; i++) result.push(await ctx.db.insert("forms", { ownerId: creatorIdentity.subject, title: i === 0 ? "Outside inventory" : `Form ${i}`, shareId: `form-${i}`, status: "draft", draft: emptyDefinition(), draftRevision: 1, settings: defaultFormSettings, responseCount: 0, partialCount: 0, createdAt: 0, updatedAt: i }));
    return result;
  });
  const native = t.withIdentity(creatorIdentity);
  expect((await native.query(api.forms.listMyForms, {})).owned.map(row => row._id)).toEqual(ids.slice(1).reverse());
  expect((await native.query(api.forms.searchIndex, {})).map(row => row.id)).toEqual(ids.slice(201).reverse());
  const mcp = await t.query(internal.mcp.searchForms, { userId: creatorIdentity.subject, limit: 100 });
  expect(mcp.total).toBe(500);
  expect(mcp.items.map(row => row.id)).toEqual(ids.slice(451).reverse().map(id => `form_${id}`));
  await t.run(ctx => ctx.db.insert("formCollaborators", { formId: ids[0], email: creatorIdentity.email, userId: creatorIdentity.subject, role: "viewer", status: "accepted", invitedBy: creatorIdentity.subject, createdAt: 0 }));
  expect((await native.query(api.forms.listMyForms, {})).shared).toEqual([]);
  expect((await native.query(api.forms.searchIndex, {})).map(row => row.id)).toEqual([...ids.slice(201).reverse(), ids[0]]);
  const outsideWindow = await t.query(internal.mcp.searchForms, { userId: creatorIdentity.subject, query: "Outside inventory" });
  expect(outsideWindow.total).toBe(1);
  expect(outsideWindow.items[0]).toMatchObject({ id: `form_${ids[0]}`, role: "viewer" });
});

it("retains the 100/200 collaborator query bounds without letting declined rows deduplicate grants", async () => {
  const t = createTestConvex();
  const ids = await t.run(async ctx => {
    const form = (title: string) => ctx.db.insert("forms", { ownerId: creatorIdentity.subject, title, shareId: title, status: "draft", draft: emptyDefinition(title), draftRevision: 1, settings: defaultFormSettings, responseCount: 0, partialCount: 0, createdAt: 0, updatedAt: 0 });
    const visible = await form("Visible"), beyond = await form("Beyond");
    for (let i = 0; i < 201; i++) await ctx.db.insert("formCollaborators", { formId: i === 200 ? beyond : visible, email: otherCreatorIdentity.email, userId: otherCreatorIdentity.subject, role: "editor", status: i === 100 || i === 200 ? "accepted" : "declined", invitedBy: creatorIdentity.subject, createdAt: i });
    return { visible, beyond };
  });
  const native = t.withIdentity(otherCreatorIdentity);
  expect((await native.query(api.forms.listMyForms, {})).shared.map(row => row._id)).toEqual([ids.visible]);
  expect(await native.query(api.forms.searchIndex, {})).toEqual([]);
  expect((await t.query(internal.mcp.searchForms, { userId: otherCreatorIdentity.subject })).items.map(row => row.id)).toEqual([`form_${ids.visible}`]);
});
