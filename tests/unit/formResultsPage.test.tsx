import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { LocaleProvider } from "@/lib/i18n";
import ResponsesPage from "@/app/dashboard/forms/[formId]/responses/page";

const now = Date.now();
const options = [{ id: "a", label: "Paris" }, { id: "b", label: "Lyon" }];
const definition = {
  schemaVersion: 1, title: "Capitals", description: "", defaultLanguage: "en", languages: ["en"], presentation: "page", endings: [], theme: {}, quiz: { enabled: true },
  fields: [
    { id: "capital", type: "choice", label: "Capital of France?", required: false, options, quiz: { correctOptionIds: ["a"], points: 1 } },
    { id: "age", type: "number", label: "Your age", required: false },
    { id: "note", type: "textarea", label: "Anything else?", required: false },
  ],
};
const field = (f: Record<string, unknown>) => ({ skipped: 0, notApplicable: 0, notAsked: 0, stoppedAfter: 0, distribution: null, average: null, numberStats: null, dateStats: null, texts: null, textCount: 0, quiz: null, ...f });
const analysis = {
  title: "Capitals", collectPartial: true, responseCount: 3, partialCount: 1, completionRate: 0.75, averageDurationMs: 65_000, medianDurationMs: 60_000,
  sampled: 3, editedResponses: 0, sampleLimited: false, stoppedBeforeFirst: 1, matrix: {}, endings: [], languages: { en: 3 }, definition,
  perDay: [{ day: new Date(now).toISOString().slice(0, 10), count: 3 }], lastResponseAt: now - 60_000, quizEnabled: true,
  quiz: { average: 0.67, median: 1, maxScore: 1, passRate: 0.67, graded: 3, bins: [0, 20, 40, 60, 80].map((from) => ({ from, to: from + 20, count: from === 80 ? 2 : from === 0 ? 1 : 0 })) },
  fields: [
    field({ fieldId: "capital", label: "Capital of France?", type: "choice", answered: 3, distribution: [{ id: "a", label: "Paris", count: 2 }, { id: "b", label: "Lyon", count: 1 }],
      quiz: { answered: 3, correct: 2, correctRate: 2 / 3, commonWrong: { label: "Lyon", count: 1 }, correctLabels: ["Paris"] } }),
    field({ fieldId: "age", label: "Your age", type: "number", answered: 3, numberStats: { min: 20, max: 40, mean: 30, median: 30, bins: [{ from: 20, to: 30, count: 1 }, { from: 30, to: 40, count: 2 }] } }),
    field({ fieldId: "note", label: "Anything else?", type: "textarea", answered: 2, skipped: 1, textCount: 2,
      texts: [{ responseId: "r1", text: "Loved it", submittedAt: now }, { responseId: "r2", text: "Too long", submittedAt: now - 1000 }] }),
  ],
};
const form = { _id: "f1", title: "Capitals", role: "owner", responseCount: 3, partialCount: 1, lastResponseAt: now, draft: definition };
const row = (id: string, preview: string, extra: Record<string, unknown> = {}) => ({
  _id: id, status: "completed", submittedAt: now - Number(id.slice(1)) * 60_000, updatedAt: now, receiptCode: `RC-${id}`, language: "en", durationMs: 60_000,
  reviewed: false, tags: [], spam: false, version: 1, editCount: 0, editedAt: null, quizScore: 1, quizMaxScore: 1, preview, ...extra,
});
const rows = [row("r1", "Paris · 20"), row("r2", "Lyon · 30", { reviewed: true, quizScore: 0 }), row("r3", "Paris · 40", { tags: ["vip"] })];
const detail = (id: string) => ({
  _id: id, formId: "f1", status: "completed", version: 1, language: "en", receiptCode: `RC-${id}`, startedAt: now, submittedAt: now, updatedAt: now, durationMs: 60_000,
  quizScore: 1, quizMaxScore: 1, editCount: 0, editedAt: null, revisions: [], reviewed: false, tags: [], spam: false, respondent: null, ending: null, lastFieldId: undefined,
  items: [{ fieldId: "capital", label: "Capital of France?", type: "choice", state: "answered", text: `Answer of ${id}`, scale: null, files: [] }],
  canEdit: true, canDelete: true,
});

const m = vi.hoisted(() => ({ mutation: vi.fn(async () => 1), paginated: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useParams: () => ({ formId: "f1" }) }));
vi.mock("@/lib/convexClient", () => ({ convex: null }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(ref);
    if (name === "forms:getFormForEditor") return form;
    if (name === "formResults:getAnalysis") return analysis;
    if (name === "formResults:listTags") return ["vip"];
    if (name === "formResults:listSavedViews") return [];
    if (name === "formResults:getResponse") return detail((args as { responseId: string }).responseId);
    return undefined;
  },
  usePaginatedQuery: (_ref: unknown, args: unknown) => { m.paginated(args); return { results: rows, status: "Exhausted", loadMore: vi.fn() }; },
  useMutation: () => m.mutation,
  useConvex: () => ({ query: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  // Wide screen: the reading pane sits beside the list.
  window.matchMedia = ((query: string) => ({ matches: query.includes("min-width"), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
});

const renderPage = (locale: "en" | "ar" = "en") => render(<LocaleProvider initial={locale}><div className="workspace-ui"><ResponsesPage /></div></LocaleProvider>);

describe("form results page", () => {
  it("opens on the summary with the headline numbers and per-question cards", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: /Summary/ })).toHaveAttribute("aria-selected", "true");
    const stats = screen.getByRole("region", { name: "Summary" });
    for (const [label, value] of [["Responses", "3"], ["Completion rate", "75%"], ["Average time", "1m 5s"], ["Scored 50% or more", "67%"]]) {
      expect(within(stats).getByText(label).closest("div")).toHaveTextContent(value);
    }
    const capital = screen.getByRole("region", { name: "Capital of France?" });
    expect(capital).toHaveTextContent("67% correct");
    expect(capital).toHaveTextContent("Most common wrong answer");
    expect(capital).toHaveTextContent("Lyon · 1");
    const age = screen.getByRole("region", { name: "Your age" });
    for (const text of ["Lowest", "20", "Median", "30", "Highest", "40"]) expect(age).toHaveTextContent(text);
    const note = screen.getByRole("region", { name: "Anything else?" });
    expect(note).toHaveTextContent("2 responses · 1 skipped");
    expect(within(note).getByRole("list", { name: "Anything else?" })).toHaveTextContent("Loved it");
  });

  it("filters with our own menus, never native selects", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole("tab", { name: /Responses/ }));
    expect(container.querySelector("select")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Status" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Unfinished" }));
    expect(m.paginated).toHaveBeenLastCalledWith(expect.objectContaining({ filter: { status: "partial" } }));
    expect(screen.getByRole("button", { name: "Status" })).toHaveTextContent("Status: Unfinished");
    await user.click(screen.getByRole("button", { name: "Sort" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Oldest first" }));
    expect(m.paginated).toHaveBeenLastCalledWith(expect.objectContaining({ order: "asc" }));
    await user.click(screen.getByRole("button", { name: /Clear filters/ }));
    expect(m.paginated).toHaveBeenLastCalledWith(expect.objectContaining({ filter: {} }));
  });

  it("moves through responses with the keyboard and reads one beside the list, with previous and next", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: /Responses/ }));
    const list = screen.getByRole("list", { name: "Responses" });
    const openers = within(list).getAllByRole("button");
    expect(openers[0]).toHaveAttribute("tabindex", "0");
    expect(openers[1]).toHaveAttribute("tabindex", "-1");
    openers[0].focus();
    await user.keyboard("{ArrowDown}");
    expect(openers[1]).toHaveFocus();
    await user.keyboard("{End}");
    expect(openers[2]).toHaveFocus();
    await user.keyboard("{Home}{ArrowDown}{Enter}");
    const pane = screen.getByRole("complementary", { name: "Response" });
    expect(pane).toHaveTextContent("Answer of r2");
    expect(pane).toHaveTextContent("2 of 3");
    await user.click(within(pane).getByRole("button", { name: "Next response" }));
    expect(pane).toHaveTextContent("Answer of r3");
    await user.click(within(pane).getByRole("button", { name: "Previous response" }));
    await user.click(within(pane).getByRole("button", { name: "Previous response" }));
    expect(pane).toHaveTextContent("Answer of r1");
    expect(within(pane).getByRole("button", { name: "Previous response" })).toBeDisabled();
    await user.click(within(pane).getByRole("button", { name: /Reviewed/ }));
    expect(m.mutation).toHaveBeenCalledWith({ formId: "f1", responseIds: ["r1"], reviewed: true });
  });

  it("deletes after an in-app confirmation, never window.confirm", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    renderPage();
    await user.click(screen.getByRole("tab", { name: /Responses/ }));
    await user.click(screen.getByRole("checkbox", { name: "Select response RC-r1" }));
    await user.click(screen.getByRole("checkbox", { name: "Select response RC-r3" }));
    const bar = screen.getByRole("toolbar", { name: "Bulk actions" });
    expect(bar).toHaveTextContent("2 selected");
    await user.click(within(bar).getByRole("button", { name: /Delete/ }));
    const dialog = screen.getByRole("dialog", { name: "Delete 2 responses?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(m.mutation).toHaveBeenCalledWith({ formId: "f1", responseIds: ["r1", "r3"] });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("searches with the icon inset from the start edge, in Arabic too", async () => {
    vi.useFakeTimers();
    try {
      renderPage("ar");
      fireEvent.click(screen.getByRole("tab", { name: /الردود/ }));
      const search = screen.getByRole("searchbox", { name: "ابحث في الإجابات" });
      expect(search.closest(".ws-search")).not.toBeNull();
      fireEvent.change(search, { target: { value: "Paris" } });
      act(() => { vi.advanceTimersByTime(400); });
      expect(m.paginated).toHaveBeenLastCalledWith(expect.objectContaining({ filter: { search: "Paris" } }));
      expect(screen.getByRole("button", { name: "الحالة" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers the three export formats with descriptions", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: /Export/ }));
    for (const name of ["Excel (.xlsx)", "CSV", "JSON"]) expect(screen.getByRole("button", { name: `Download ${name}` })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Include unfinished responses" })).toBeInTheDocument();
  });
});
