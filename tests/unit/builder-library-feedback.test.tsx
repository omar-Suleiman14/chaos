import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FormBuilderPage from "@/app/[lang]/(app)/dashboard/forms/[formId]/page";
import CreatorLibrary from "@/components/library/CreatorLibrary";

const fixtures = vi.hoisted(() => {
  const form = {
    _id: "form-1", title: "Feedback", status: "live", shareId: "share-1",
    publishedVersion: 1, responseCount: 3, hasUnpublishedChanges: true,
    updatedAt: 1, quizMode: false,
  };
  const draft = { title: "Feedback", fields: [], languages: ["en"], defaultLanguage: "en" };
  return {
    form,
    editor: { ...form, role: "owner", settings: {}, draft, draftRevision: 1 },
    draftState: {
      draft, saveState: { kind: "saved" }, isDirty: () => false,
      revision: () => 1, canUndo: false, canRedo: false,
    },
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ formId: "form-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams("tab=forms"),
}));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    forms: { getFormForEditor: "editor", listMyForms: "forms", listTemplates: "templates" },
    live: { createGame: "createGame" },
    courses: { create: "createCourse", listMine: "courses" },
  },
}));
vi.mock("convex/react", () => ({
  useQuery: (query: string) => {
    if (query === "editor") return fixtures.editor;
    if (query === "forms") return { owned: [fixtures.form], shared: [] };
    if (query === "courses") return [];
    return { builtIn: [], own: [] };
  },
  useMutation: () => vi.fn(),
}));
vi.mock("@/app/[lang]/(app)/dashboard/forms/[formId]/use-form-draft", () => ({
  useFormDraft: () => fixtures.draftState,
}));
vi.mock("@/lib/learn/data", () => ({ useMyLessons: () => [], useLearnActions: () => ({ createLesson: vi.fn() }) }));
vi.mock("@/components/workspace/useCreateForm", () => ({
  useCreateForm: () => ({ create: vi.fn(), busy: false }),
}));
vi.mock("@/convex/formLogic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/convex/formLogic")>()),
  checkDefinition: () => ({ errors: [], warnings: [] }), fieldTypeLabels: {},
}));
vi.mock("@/lib/formImporters", () => ({ importForm: vi.fn() }));
vi.mock("@/components/library/FormThumb", () => ({ default: () => null }));
vi.mock("@/components/forms/builder/BuildTab", () => ({ default: () => null }));
vi.mock("@/components/forms/builder/LogicTab", () => ({ default: () => null }));
vi.mock("@/components/forms/builder/TranslateTab", () => ({ default: () => null }));
vi.mock("@/components/forms/builder/DesignTab", () => ({ default: () => null }));
vi.mock("@/components/forms/builder/SettingsTab", () => ({ default: () => null }));
vi.mock("@/components/forms/builder/ShareTab", () => ({ default: () => null }));
vi.mock("@/components/forms/builder/TeamTab", () => ({ default: () => null }));
vi.mock("@/components/forms/builder/HistoryTab", () => ({ default: () => null }));
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- This custom dialog uses the existing focus, Escape and dismissal lifecycle; a native dialog would require a different open and top-layer lifecycle. */
vi.mock("@/components/forms/builder/FormPreview", () => ({
  FullPreview: () => <div role="dialog" aria-label="Form preview" />,
}));
/* oxlint-enable jsx-a11y/prefer-tag-over-role */

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value });
}

beforeEach(() => {
  localStorage.clear();
  fixtures.form.hasUnpublishedChanges = true;
  fixtures.editor.responseCount = 3;
});
afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

describe.each([
  { name: "builder", Component: FormBuilderPage, menu: "More actions" },
  { name: "library", Component: CreatorLibrary, menu: "Actions for Feedback" },
])("$name clipboard feedback", ({ Component, menu }) => {
  function copy() {
    fireEvent.click(screen.getByRole("button", { name: menu }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy link" }));
  }

  it("shows success only after the clipboard write resolves", async () => {
    let resolve!: () => void;
    const writeText = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    setClipboard({ writeText });
    render(<Component />);
    copy();

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/f/share-1`);
    expect(screen.queryByText(/Link copied/)).not.toBeInTheDocument();
    await act(async () => resolve());
    expect(screen.getByRole("status")).toHaveTextContent("Link copied");
  });

  it("surfaces a rejected clipboard write without success", async () => {
    let reject!: (error: Error) => void;
    setClipboard({ writeText: () => new Promise<void>((_, fail) => { reject = fail; }) });
    render(<Component />);
    copy();
    expect(screen.queryByText(/Link copied/)).not.toBeInTheDocument();
    await act(async () => reject(new DOMException("Clipboard permission denied", "NotAllowedError")));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not copy the link. Please try again.");
    expect(screen.queryByText(/Link copied/)).not.toBeInTheDocument();
  });

  it.each([undefined, {}])("reports an unavailable clipboard (%j)", (clipboard) => {
    setClipboard(clipboard);
    render(<Component />);
    copy();
    expect(screen.getByRole("alert")).toHaveTextContent("Clipboard is unavailable in this browser.");
    expect(screen.queryByText(/Link copied/)).not.toBeInTheDocument();
  });

  it("surfaces synchronous clipboard errors", () => {
    setClipboard({ writeText: () => { throw new Error("Clipboard access blocked"); } });
    render(<Component />);
    copy();
    expect(screen.getByRole("alert")).toHaveTextContent("Clipboard access blocked");
    expect(screen.queryByText(/Link copied/)).not.toBeInTheDocument();
  });

  it("clears stale success and error feedback when retrying", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<Component />);
    copy();
    expect(await screen.findByText(/Link copied/)).toBeInTheDocument();

    setClipboard(undefined);
    copy();
    expect(screen.queryByText(/Link copied/)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    let resolve!: () => void;
    setClipboard({ writeText: () => new Promise<void>((done) => { resolve = done; }) });
    copy();
    // The error stays until the retry has an outcome, which then takes its place.
    await act(async () => resolve());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Link copied");
  });
});

describe("builder mobile actions", () => {
  it.each([0, 3])("keeps accessible names with mobile labels hidden (%i responses)", (count) => {
    fixtures.editor.responseCount = count;
    const { container } = render(<FormBuilderPage />);
    // jsdom does not apply responsive styles; reproduce the mobile hiding rule.
    container.querySelectorAll<HTMLElement>(".ws-phone-hide").forEach((label) => {
      label.style.display = "none";
    });

    const results = screen.getByRole("link", { name: count ? `Results (${count})` : "Results" });
    expect(results).toHaveAttribute("href", "/dashboard/forms/form-1/responses");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("dialog", { name: "Form preview" })).toBeInTheDocument();
  });
});

describe("library gallery status", () => {
  it.each([true, false])("reflects unpublished edits: %s", (edited) => {
    fixtures.form.hasUnpublishedChanges = edited;
    render(<CreatorLibrary />);
    const gallery = within(screen.getByRole("region", { name: "Ungrouped" }));
    expect(gallery.getByText(edited ? "Live · unpublished changes" : "Live")).toBeInTheDocument();
    if (!edited) expect(gallery.queryByText(/unpublished changes/)).not.toBeInTheDocument();
  });
});
