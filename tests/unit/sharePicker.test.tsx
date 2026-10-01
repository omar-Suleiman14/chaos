import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import SharePicker from "@/components/connections/SharePicker";
import type { Folder, Lesson } from "@/lib/learn/types";

vi.mock("convex/react", () => ({ useConvex: () => ({ query: async (ref: Parameters<typeof getFunctionName>[0]) => {
  const name = getFunctionName(ref);
  if (name === "lessons:listOwned") return { page: [{ _id: "k1", metadata: { title: "Portal Hypertension" }, status: "active" }], isDone: true, continueCursor: "" };
  if (name === "curricula:listLessonMappings") return { page: [{ nodeId: "n1", versionId: "v1" }], isDone: true, continueCursor: "" };
  throw new Error(name);
} }) }));

vi.mock("@/lib/convexCache", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === "integrations:listShareableItems") return [{ ref: "form_1", kind: "form", title: "Survey", updatedAt: 1 }];
    if (name === "lessons:listOwned") return { page: [{ _id: "k1", metadata: { title: "Portal Hypertension" }, status: "active" }], isDone: true, continueCursor: "" };
    if (name === "curricula:listInstitutions") return { page: [{ _id: "i1", name: "University" }], isDone: true, continueCursor: "" };
    if (name === "curricula:listPrograms") return { page: [{ _id: "p1", name: "Medicine" }], isDone: true, continueCursor: "" };
    if (name === "curricula:listVersions") return { page: [{ _id: "v1", name: "2026" }], isDone: true, continueCursor: "" };
    if (name === "curricula:listNodes") return { page: [{ _id: "n1", name: "GIT", kind: "module" }], isDone: true, continueCursor: "" };
    return undefined;
  },
}));

const localLesson = { id: "l1", archived: false, draft: { meta: { title: "Local", description: "", tags: [], language: "en", curricula: [{ moduleId: "m", versionId: "v", path: ["Uni", "GIT"], versionLabel: "2025" }], indexing: "noindex" }, content: [], updatedAt: 0 } } as unknown as Lesson;
const folder = { id: "f1", ownerId: "u", name: "Gastro pack", collection: { description: "", visibility: "private" }, createdAt: 0, updatedAt: 0 } as Folder;

function setup(lessonsAllowed = true) {
  const fns = { onChange: vi.fn(), onLessonChange: vi.fn(), onPendingChange: vi.fn() };
  render(<SharePicker value={[]} lessonValue={[]} pendingValue={[]} lessonsAllowed={lessonsAllowed} learn={{ lessons: [localLesson], folders: [folder], nodes: [] }} {...fns} />);
  return fns;
}

describe("SharePicker", () => {
  it("keeps collections disabled and resolves modules into explicit lesson selections", async () => {
    const fns = setup();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(fns.onChange).toHaveBeenCalledWith(["form_1"]);

    fireEvent.click(screen.getByRole("tab", { name: "Lessons" }));
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Portal Hypertension/ }));
    expect(fns.onLessonChange).toHaveBeenCalledWith(["lesson_k1"]);

    fireEvent.click(screen.getByRole("tab", { name: "Collections" }));
    expect(screen.getByRole("note")).toHaveTextContent("Collection content sharing is not available");
    expect(screen.getByRole("button", { name: "Collection sharing unavailable" })).toBeDisabled();
    expect(fns.onPendingChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Curricula" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Institution" }), { target: { value: "i1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Program" }), { target: { value: "p1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Curriculum version" }), { target: { value: "v1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Module or subject" }), { target: { value: "n1" } });
    fireEvent.click(screen.getByRole("button", { name: "Review lessons" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Select these lessons" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Select these lessons" }));
    expect(fns.onLessonChange).toHaveBeenLastCalledWith(["lesson_k1"]);
    expect(fns.onPendingChange).not.toHaveBeenCalled();
  });

  it("explains that a lesson scope is needed before lessons can be picked", () => {
    setup(false);
    fireEvent.click(screen.getByRole("tab", { name: "Lessons" }));
    expect(screen.getByRole("note")).toHaveTextContent("Turn on “Read selected lessons”");
    expect(screen.getByRole("checkbox", { name: /Portal Hypertension/ })).toBeDisabled();
  });
});
