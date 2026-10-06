import { expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import { emptyDefinition } from "@/convex/formLogic";
import { createTestConvexWithAdmin } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

const paginationOpts = { cursor: null, numItems: 25 };

async function setup() {
  const t = await createTestConvexWithAdmin(otherCreatorIdentity.subject);
  const owner = t.withIdentity(creatorIdentity), admin = t.withIdentity(otherCreatorIdentity);
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await admin.mutation(api.quizFunctions.getOrCreateUser, {});
  await owner.mutation(api.links.chooseUsername, { username: "casey" });
  const formId = await owner.mutation(api.forms.createForm, { definition: emptyDefinition("Neuroanatomy checkpoint") });
  return { admin, owner, formId };
}

it("finds accounts by part of a name or email, a username or an exact email, across every account", async () => {
  const { admin } = await setup();
  const emails = async (search: string) => (await admin.query(api.admin.users, { paginationOpts, search })).page.map((u) => u.email);
  expect(await emails("creator")).toContain("creator@example.com");
  expect(await emails("rival")).toEqual(["other-creator@example.com"]);
  expect(await emails("@casey")).toEqual(["creator@example.com"]);
  expect(await emails("creator@example.com")).toContain("creator@example.com");
  expect(await emails("nobody-here")).toEqual([]);
  // Without a search it still pages through everyone, newest first.
  expect((await admin.query(api.admin.users, { paginationOpts })).page).toHaveLength(2);
});

it("finds forms by title words or exact id, not just the loaded page, and stays admin-only", async () => {
  const { admin, owner, formId } = await setup();
  const titles = async (search: string) => (await admin.query(api.admin.content, { kind: "forms", paginationOpts, search })).page.map((f) => f.title);
  expect(await titles("neuroanatomy")).toEqual(["Neuroanatomy checkpoint"]);
  expect(await titles(formId)).toEqual(["Neuroanatomy checkpoint"]);
  expect(await titles("cardiology")).toEqual([]);
  await expect(owner.query(api.admin.users, { paginationOpts, search: "creator" })).rejects.toThrow();
});
