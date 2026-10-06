import { describe, expect, it } from "vitest";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { emptyDefinition } from "@/convex/formLogic";
import { createTestConvex } from "./setup";
import { creatorIdentity, otherCreatorIdentity } from "../fixtures";

/**
 * Invalidation: after a write, every open subscription must receive the new
 * truth. Convex re-runs a subscribed query whenever a document it read
 * changes, so each "view" below is a query some open client holds, and
 * `refresh()` re-evaluates all of them the way the server pushes updates.
 * The assertions are about what those clients then see.
 */
type T = ReturnType<typeof createTestConvex>;
type Client = ReturnType<T["withIdentity"]> | T;

class Views {
  private views: { refresh: () => Promise<void> }[] = [];
  watch<Q extends FunctionReference<"query">>(client: Client, query: Q, args: FunctionArgs<Q>) {
    const view = { value: undefined as FunctionReturnType<Q> | undefined, error: undefined as unknown, refresh: async () => {
      try { view.value = await (client.query as (q: Q, a: FunctionArgs<Q>) => Promise<FunctionReturnType<Q>>)(query, args); view.error = undefined; } catch (error) { view.value = undefined; view.error = error; }
    } };
    this.views.push(view);
    return view;
  }
  async refresh() { for (const view of this.views) await view.refresh(); }
}

const lessonBlocks = (text: string) => ({ schemaVersion: 1 as const, blocks: [{ id: "p", type: "paragraph" as const, text, citations: [], conceptIds: [] }] });

async function owners(t: T) {
  const owner = t.withIdentity(creatorIdentity), other = t.withIdentity({ ...otherCreatorIdentity, emailVerified: true });
  await owner.mutation(api.quizFunctions.getOrCreateUser, {});
  await other.mutation(api.quizFunctions.getOrCreateUser, {});
  return { owner, other };
}

async function publishedCourse(t: T, owner: ReturnType<T["withIdentity"]>) {
  const courseId = await owner.mutation(api.courses.create, { title: "Central nervous system" });
  const lessons: Id<"lessons">[] = [];
  for (const title of ["Meninges", "Ventricles"]) {
    const lessonId = await owner.mutation(api.courses.addLesson, { courseId, title });
    await owner.mutation(api.lessons.saveDraft, { lessonId, expectedRevision: 0, document: lessonBlocks(title) });
    lessons.push(lessonId);
  }
  await owner.mutation(api.courses.publish, { courseId, visibility: "public" });
  return { courseId, lessons };
}

describe("invalidation across clients", () => {
  it("deleting a form on client A removes it from client B and from A's other device", async () => {
    const t = createTestConvex();
    const { owner, other } = await owners(t);
    await owner.mutation(api.businessTeams.create, { name: "Faculty" });
    const formId = await owner.mutation(api.forms.createForm, { definition: emptyDefinition("Shared survey") });
    await owner.mutation(api.forms.inviteCollaborator, { formId, email: otherCreatorIdentity.email, role: "editor" });
    const invite = (await t.run((ctx) => ctx.db.query("formCollaborators").collect()))[0];
    await other.mutation(api.forms.acceptInvite, { collaboratorId: invite._id });

    const views = new Views();
    const ownerSecondDevice = views.watch(owner, api.forms.listMyForms, {});
    const collaboratorLibrary = views.watch(other, api.forms.listMyForms, {});
    const collaboratorEditor = views.watch(other, api.forms.getFormForEditor, { formId });
    const collaboratorSearch = views.watch(other, api.forms.searchIndex, {});
    await views.refresh();
    expect(ownerSecondDevice.value?.owned.map((f) => f._id)).toContain(formId);
    expect(collaboratorLibrary.value?.shared.map((f) => f._id)).toContain(formId);
    expect(collaboratorEditor.value?.draft.title).toBe("Shared survey");

    // Deleting is a two-step action in Chaos: archive, then delete.
    await owner.mutation(api.forms.setFormStatus, { formId, status: "archived" });
    await views.refresh();
    expect(collaboratorLibrary.value?.shared.find((f) => f._id === formId)?.status).toBe("archived");
    await owner.mutation(api.forms.deleteForm, { formId });
    await views.refresh();
    expect(ownerSecondDevice.value?.owned.map((f) => f._id)).not.toContain(formId);
    expect(collaboratorLibrary.value?.shared.map((f) => f._id)).not.toContain(formId);
    expect(collaboratorEditor.value).toBeNull();
    expect(collaboratorSearch.value?.map((row) => row.id)).not.toContain(formId);
  });

  it("renaming a course updates every owner view at once; the public page waits for publication", async () => {
    const t = createTestConvex();
    const { owner } = await owners(t);
    const { courseId, lessons } = await publishedCourse(t, owner);
    const views = new Views();
    const library = views.watch(owner, api.courses.listMine, {});
    const editor = views.watch(owner, api.courses.get, { courseId });
    const publicPage = views.watch(t, api.courses.getPublic, { courseId });

    await owner.mutation(api.courses.update, { courseId, title: "Neuroscience I" });
    await views.refresh();
    expect(library.value?.find((c) => c.id === courseId)?.title).toBe("Neuroscience I");
    expect(editor.value?.title).toBe("Neuroscience I");
    // Drafts never leak: readers keep the published title until the owner republishes.
    expect(publicPage.value?.title).toBe("Central nervous system");

    await owner.mutation(api.courses.publish, { courseId, visibility: "public" });
    await views.refresh();
    expect(publicPage.value?.title).toBe("Neuroscience I");
    expect(publicPage.value?.lessons.map((l) => l.id)).toEqual(lessons);
  });

  it("publishing a lesson clears the course's pending flag and reaches readers of the course", async () => {
    const t = createTestConvex();
    const { owner } = await owners(t);
    const { courseId, lessons } = await publishedCourse(t, owner);
    const views = new Views();
    const editor = views.watch(owner, api.courses.get, { courseId });
    const publicPage = views.watch(t, api.courses.getPublic, { courseId });

    const draft = await owner.query(api.lessons.getDraft, { lessonId: lessons[0] });
    await owner.mutation(api.lessons.saveDraft, { lessonId: lessons[0], expectedRevision: draft.revision, document: lessonBlocks("Dura, arachnoid, pia"), metadata: { ...draft.metadata, title: "The meninges" } });
    await views.refresh();
    expect(editor.value?.lessons.find((l) => l.id === lessons[0])?.changed).toBe(true);
    expect(publicPage.value?.lessons[0].title).toBe("Meninges");

    const saved = await owner.query(api.lessons.getDraft, { lessonId: lessons[0] });
    await owner.mutation(api.lessons.publish, { lessonId: lessons[0], expectedRevision: saved.revision, visibility: "public" });
    await views.refresh();
    expect(editor.value?.lessons.find((l) => l.id === lessons[0])?.changed).toBe(false);
    expect(publicPage.value?.lessons[0].title).toBe("The meninges");
  });

  it("archiving updates the dashboard lists and hides the item from readers", async () => {
    const t = createTestConvex();
    const { owner } = await owners(t);
    const { courseId } = await publishedCourse(t, owner);
    const formId = await owner.mutation(api.forms.createForm, { definition: emptyDefinition("Feedback") });
    const views = new Views();
    const courses = views.watch(owner, api.courses.listMine, {});
    const forms = views.watch(owner, api.forms.listMyForms, {});
    const publicCourse = views.watch(t, api.courses.getPublic, { courseId });
    const directory = views.watch(t, api.courses.listPublic, {});
    await views.refresh();
    expect(directory.value?.map((c) => c.id)).toContain(courseId);

    await owner.mutation(api.courses.setArchived, { courseId, archived: true });
    await owner.mutation(api.forms.setFormStatus, { formId, status: "archived" });
    await views.refresh();
    expect(courses.value?.find((c) => c.id === courseId)?.archived).toBe(true);
    expect(forms.value?.owned.find((f) => f._id === formId)?.status).toBe("archived");
    expect(publicCourse.value).toBeNull();
    expect(directory.value?.map((c) => c.id)).not.toContain(courseId);

    await owner.mutation(api.courses.setArchived, { courseId, archived: false });
    await views.refresh();
    expect(courses.value?.find((c) => c.id === courseId)?.archived).toBe(false);
  });
});
