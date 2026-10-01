import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import SharePicker from "@/components/connections/SharePicker";
import type { Folder, Lesson } from "@/lib/learn/types";

vi.mock("@/lib/convexCache", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === "integrations:listShareableItems") return [{ ref: "form_1", kind: "form", title: "Survey", updatedAt: 1 }];
    if (name === "lessons:listOwned") return { page: [{ _id: "k1", metadata: { title: "Portal Hypertension" }, status: "active" }], isDone: true, continueCursor: "" };
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
  it("stores forms and backend lessons, and keeps collection and curriculum picks pending", () => {
    const fns = setup();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(fns.onChange).toHaveBeenCalledWith(["form_1"]);

    fireEvent.click(screen.getByRole("tab", { name: "Lessons" }));
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Portal Hypertension/ }));
    expect(fns.onLessonChange).toHaveBeenCalledWith(["lesson_k1"]);

    fireEvent.click(screen.getByRole("tab", { name: "Collections" }));
    expect(screen.getByRole("note")).toHaveTextContent("Not saved yet");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(fns.onPendingChange).toHaveBeenCalledWith(["folder_f1"]);

    fireEvent.click(screen.getByRole("tab", { name: "Curricula" }));
    expect(screen.getByText("Uni › GIT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(fns.onPendingChange).toHaveBeenLastCalledWith(["curriculum_m"]);
    expect(fns.onLessonChange).toHaveBeenCalledTimes(1);
  });

  it("explains that a lesson scope is needed before lessons can be picked", () => {
    setup(false);
    fireEvent.click(screen.getByRole("tab", { name: "Lessons" }));
    expect(screen.getByRole("note")).toHaveTextContent("Turn on “Read selected lessons”");
    expect(screen.getByRole("checkbox", { name: /Portal Hypertension/ })).toBeDisabled();
  });
});
