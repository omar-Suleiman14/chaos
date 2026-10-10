import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { LocaleProvider } from "@/lib/i18n";
import ResponsesPage from "@/app/[lang]/(app)/dashboard/forms/[formId]/responses/page";

const definition = { schemaVersion: 1, title: "Signup", description: "", defaultLanguage: "en", languages: ["en"], presentation: "page", endings: [], theme: {}, fields: [{ id: "name", type: "text", label: "Name", required: false }] };
const form = { _id: "f1", title: "Signup", role: "owner", responseCount: 0, partialCount: 0, lastResponseAt: null, draft: definition };
const empty = { title: "Signup", collectPartial: false, responseCount: 0, partialCount: 0, completionRate: 0, averageDurationMs: null, medianDurationMs: null, sampled: 0, editedResponses: 0, sampleLimited: false, stoppedBeforeFirst: 0, matrix: {}, endings: [], languages: {}, definition, perDay: [], lastResponseAt: null, quizEnabled: false, quiz: null, fields: [] };
const state = vi.hoisted(() => ({ analysis: undefined as unknown, page: { results: [] as unknown[], status: "Exhausted" } }));

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useParams: () => ({ formId: "f1" }) }));
vi.mock("@/lib/convexClient", () => ({ convex: null }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(ref);
    if (name === "forms:getFormForEditor") return form;
    if (name === "formResults:getAnalysis") return state.analysis;
    if (name === "formResults:listTags" || name === "formResults:listSavedViews") return [];
    return undefined;
  },
  usePaginatedQuery: () => ({ ...state.page, loadMore: vi.fn() }),
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));

const art = () => document.querySelector(".state-illustration");
const renderPage = () => render(<LocaleProvider initial="en"><div className="workspace-ui"><ResponsesPage /></div></LocaleProvider>);

beforeEach(() => {
  state.analysis = empty;
  state.page = { results: [], status: "Exhausted" };
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = ((query: string) => ({ matches: query.includes("min-width"), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
});

describe("results empty states", () => {
  it("keeps the summary skeleton, without an illustration, while the analysis loads", () => {
    state.analysis = undefined;
    renderPage();
    expect(art()).toBeNull();
  });

  it("draws the creating illustration on a summary with no responses", () => {
    renderPage();
    expect(art()).toHaveAttribute("data-variant", "create");
    expect(art()).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the responses skeleton while the first page loads", async () => {
    state.page = { results: [], status: "LoadingFirstPage" };
    renderPage();
    await userEvent.setup().click(screen.getByRole("tab", { name: /Responses/ }));
    expect(art()).toBeNull();
  });

  it("draws the creating illustration for no responses yet, and the no-results one when a filter hides them all", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: /Responses/ }));
    expect(art()).toHaveAttribute("data-variant", "create");
    await user.click(screen.getByRole("button", { name: "Status" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Unfinished" }));
    expect(art()).toHaveAttribute("data-variant", "search");
    await user.click(screen.getAllByRole("button", { name: /Clear filters/ })[0]);
    expect(art()).toHaveAttribute("data-variant", "create");
  });
});
