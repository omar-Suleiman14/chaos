import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { CourseNotionImport } from "@/components/connections/NotionImport";
import ConnectedApps from "@/components/connections/ConnectedApps";
import { LocaleProvider } from "@/lib/i18n";
import type { Id } from "@/convex/_generated/dataModel";

const m = vi.hoisted(() => ({
  results: {} as Record<string, unknown>,
  push: vi.fn(),
  importPage: vi.fn(async (_args: unknown) => ({ lessonId: "lesson1", skipped: 0 })),
  createCourse: vi.fn(async (_args: unknown) => "course-new"),
  other: vi.fn(async () => null),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args?: unknown) => args === "skip" ? undefined : m.results[getFunctionName(ref)],
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "courses:create" ? m.createCourse : m.other,
  useAction: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === "notion:listPages") return async () => [{ id: "page-1", title: "Photosynthesis" }, { id: "page-2", title: "Cells" }];
    return name === "notion:importPage" ? m.importPage : m.other;
  },
}));

const course = "course-1" as Id<"learnCollections">;
const choose = (name: string, option: string) => {
  fireEvent.click(screen.getByRole("combobox", { name }));
  fireEvent.click(screen.getByRole("option", { name: new RegExp(option) }));
};
afterEach(() => { m.results = {}; vi.clearAllMocks(); });

describe("Import from Notion in the course builder", () => {
  it("stays out of the way where Notion isn't set up, and points to Connections when not connected", () => {
    m.results = { "notion:available": false, "notion:connection": null };
    const { container, rerender } = render(<LocaleProvider initial="en"><CourseNotionImport courseId={course} /></LocaleProvider>);
    expect(container.textContent).toBe("");
    m.results = { "notion:available": true, "notion:connection": null };
    rerender(<LocaleProvider initial="en"><CourseNotionImport courseId={course} /></LocaleProvider>);
    expect(screen.getByRole("link", { name: /Connect Notion to import pages/ }).getAttribute("href")).toBe("/dashboard/connections");
  });

  it("picks a shared page from the workspace dropdown and imports it into this course's module", async () => {
    m.results = { "notion:available": true, "notion:connection": { connected: true, workspaceName: "Notes" } };
    render(<LocaleProvider initial="en"><CourseNotionImport courseId={course} moduleId="m1" /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Import from Notion/ }));
    await screen.findByRole("combobox", { name: "Notion page" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect((screen.getByRole("button", { name: "Import" }) as HTMLButtonElement).disabled).toBe(true);
    choose("Notion page", "Cells");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(m.push).toHaveBeenCalledWith("/dashboard/learn/lessons/lesson1?course=course-1"));
    expect(m.importPage).toHaveBeenCalledWith({ pageId: "page-2", courseId: course, moduleId: "m1" });
  });
});

describe("Import from the Connections card", () => {
  it("requires a course, and can make a new one named after the page", async () => {
    m.results = {
      "notion:available": true, "notion:connection": { connected: true, workspaceName: "Notes", workspaceId: "w", dataSourceId: null, dataSourceTitle: null },
      "courses:listMine": [{ id: "course-1", title: "Biology", archived: false }, { id: "old", title: "Archived one", archived: true }],
    };
    render(<LocaleProvider initial="en"><ConnectedApps /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Choose a page to import" }));
    await screen.findByRole("combobox", { name: "Notion page" });
    choose("Notion page", "Photosynthesis");
    const importButton = screen.getByRole("button", { name: "Import as lesson draft" }) as HTMLButtonElement;
    expect(importButton.disabled).toBe(true);
    fireEvent.click(screen.getByRole("combobox", { name: "Course" }));
    expect(screen.queryByRole("option", { name: /Archived one/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /New course/ }));
    fireEvent.click(importButton);
    await waitFor(() => expect(m.importPage).toHaveBeenCalledWith({ pageId: "page-1", courseId: "course-new" }));
    expect(m.createCourse).toHaveBeenCalledWith({ title: "Photosynthesis", language: "en" });
    expect(screen.getByRole("link", { name: /Lesson draft created/ }).getAttribute("href")).toBe("/en/dashboard/learn/lessons/lesson1?course=course-new");
  });
});
