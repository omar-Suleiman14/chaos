import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { emptyDefinition } from "@/convex/formLogic";
import { decideFraming, DENY_FRAMING } from "@/lib/embed";
import type { EmbedTarget } from "@/lib/embed";

function definition() {
  const def = emptyDefinition("Newsletter sign-up");
  def.fields = [{ id: "name", type: "text", label: "Your name", required: true }];
  return def;
}

async function setup() {
  const t = createTestConvex();
  const owner = t.withIdentity(creatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  const formId = await owner.mutation(api.forms.createForm, { definition: definition() });
  const shareId = (await owner.query(api.forms.getFormForEditor, { formId }))!.shareId;
  const publish = async () => {
    const form = await owner.query(api.forms.getFormForEditor, { formId });
    await owner.mutation(api.forms.publishForm, { formId, expectedRevision: form!.draftRevision });
  };
  // The header the proxy would send for a framed load, answered by this test deployment.
  const header = async (path: string) =>
    decideFraming(path, "iframe", (target: EmbedTarget) => t.query(api.embed.getEmbedPolicy, target));
  return { t, owner, formId, shareId, publish, header };
}

const site = { enabled: true, origins: ["https://blog.example.com"], anyOrigin: false };

describe("embedding", () => {
  it("is off by default and never allows drafts", async () => {
    const { owner, formId, shareId, header } = await setup();
    expect(await owner.query(api.embed.getEmbedSettings, { formId })).toMatchObject({ enabled: false, origins: [], anyOrigin: false, canEdit: true, blockedBy: "unpublished" });
    await owner.mutation(api.embed.setEmbedSettings, { formId, ...site });
    expect(await owner.query(api.embed.getEmbedPolicy, { shareId })).toBeNull();
    expect(await header(`/f/${shareId}`)).toMatchObject(DENY_FRAMING);
  });

  it("frames a published form only for the listed sites", async () => {
    const { owner, formId, shareId, publish, header } = await setup();
    await publish();
    expect(await owner.query(api.embed.getEmbedPolicy, { shareId })).toBeNull();
    expect(await header(`/f/${shareId}`)).toMatchObject(DENY_FRAMING);

    const saved = await owner.mutation(api.embed.setEmbedSettings, { formId, enabled: true, origins: ["Blog.Example.com/landing", "https://blog.example.com"], anyOrigin: false });
    expect(saved.origins).toEqual(["https://blog.example.com"]);
    expect(await header(`/f/${shareId}`)).toEqual({ "Content-Security-Policy": "frame-ancestors 'self' https://blog.example.com" });

    // Turning it off, closing without a publication, archiving or requiring sign-in all deny again.
    await owner.mutation(api.embed.setEmbedSettings, { formId, ...site, enabled: false });
    expect(await header(`/f/${shareId}`)).toMatchObject(DENY_FRAMING);
    await owner.mutation(api.embed.setEmbedSettings, { formId, ...site });
    await owner.mutation(api.forms.setFormStatus, { formId, status: "closed" });
    expect((await header(`/f/${shareId}`))["Content-Security-Policy"]).toContain("https://blog.example.com");
    await owner.mutation(api.forms.setFormStatus, { formId, status: "archived" });
    expect(await header(`/f/${shareId}`)).toMatchObject(DENY_FRAMING);
  });

  it("never frames a form that asks respondents to sign in", async () => {
    const { owner, formId, shareId, publish, header } = await setup();
    await publish();
    await owner.mutation(api.embed.setEmbedSettings, { formId, enabled: true, origins: [], anyOrigin: true });
    expect((await header(`/f/${shareId}`))["Content-Security-Policy"]).toBe("frame-ancestors *");
    const { settings } = (await owner.query(api.forms.getFormForEditor, { formId }))!;
    const { hasAccessCode: _drop, accessCodeHash: _hash, ...rest } = settings;
    await owner.mutation(api.forms.updateFormSettings, { formId, settings: { ...rest, access: "signed_in" } });
    expect(await header(`/f/${shareId}`)).toMatchObject(DENY_FRAMING);
    expect(await owner.query(api.embed.getEmbedSettings, { formId })).toMatchObject({ blockedBy: "signed_in" });
  });

  it("uses the same form's list on its custom link, in any letter case", async () => {
    const { t, owner, formId, publish, header } = await setup();
    await owner.mutation(api.links.chooseUsername, { username: "omar" });
    await owner.mutation(api.links.setFormSlug, { formId, slug: "news" });
    await publish();
    await owner.mutation(api.embed.setEmbedSettings, { formId, ...site });
    for (const path of ["/omar/news", "/Omar/NEWS"]) {
      expect((await header(path))["Content-Security-Policy"], path).toBe("frame-ancestors 'self' https://blog.example.com");
    }
    for (const path of ["/omar/news/", "/omar/other", "/nobody/news", "/omar/news?x=1"]) {
      expect(await header(path), path).toMatchObject(DENY_FRAMING);
    }
    // Another creator's form at the same slug does not borrow this list.
    const other = t.withIdentity(otherCreatorIdentity);
    await other.mutation(api.quizFunctions.getOrCreateUser, {});
    await other.mutation(api.links.chooseUsername, { username: "rival" });
    const second = await other.mutation(api.forms.createForm, { definition: definition() });
    await other.mutation(api.links.setFormSlug, { formId: second, slug: "news" });
    expect(await header("/rival/news")).toMatchObject(DENY_FRAMING);
  });

  it("lets editors change it, not viewers or strangers, and validates sites", async () => {
    const { t, owner, formId } = await setup();
    await expect(owner.mutation(api.embed.setEmbedSettings, { formId, enabled: true, origins: ["javascript:alert(1)"], anyOrigin: false })).rejects.toThrow(/INVALID_EMBED/);
    await expect(owner.mutation(api.embed.setEmbedSettings, { formId, enabled: true, origins: ["https://a.com; script-src *"], anyOrigin: false })).rejects.toThrow(/INVALID_EMBED/);
    await expect(owner.mutation(api.embed.setEmbedSettings, { formId, enabled: true, origins: Array.from({ length: 21 }, (_, i) => `https://s${i}.com`), anyOrigin: false })).rejects.toThrow(/INVALID_EMBED/);

    const stranger = t.withIdentity({ ...otherCreatorIdentity, emailVerified: true });
    await stranger.mutation(api.quizFunctions.getOrCreateUser, {});
    await expect(stranger.mutation(api.embed.setEmbedSettings, { formId, ...site })).rejects.toThrow(/FORM_NOT_FOUND/);
    expect(await stranger.query(api.embed.getEmbedSettings, { formId })).toBeNull();

    await owner.mutation(api.forms.inviteCollaborator, { formId, email: otherCreatorIdentity.email, role: "viewer" });
    expect(await stranger.query(api.embed.getEmbedSettings, { formId })).toMatchObject({ canEdit: false });
    await expect(stranger.mutation(api.embed.setEmbedSettings, { formId, ...site })).rejects.toThrow(/FORM_NOT_FOUND/);

    await owner.mutation(api.forms.inviteCollaborator, { formId, email: otherCreatorIdentity.email, role: "editor" });
    await stranger.mutation(api.embed.setEmbedSettings, { formId, ...site });
    expect(await owner.query(api.embed.getEmbedSettings, { formId })).toMatchObject({ enabled: true, origins: ["https://blog.example.com"] });
  });
});
