import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";
import { emptyDefinition } from "@/convex/formLogic";

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
});
