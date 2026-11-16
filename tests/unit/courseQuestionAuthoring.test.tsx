import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  saved: { _id: "question-id", revision: 0, kind: "single_choice", prompt: "Original", choices: [{id:"a",text:"A"},{id:"b",text:"B"}], correctChoiceIds:["a"], points:1, topics:["First"], terms:[], outcomes:[], status:"ready" },
  update: vi.fn(async () => 1),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/i18n", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/i18n")>()), useLocale: () => ({ locale: "en" }) }));
vi.mock("@/components/courses/PrivateCaseImage", () => ({ default: () => null }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useConvex: () => ({ query: vi.fn() }),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(ref);
    if (name === "courses:get") return { isOwner: true, modules: [] };
    if (name === "questionBank:listForCourse") return { total: 1, items: [state.saved], nextOffset: null };
    if (name === "questionBank:get") return state.saved;
    return undefined;
  },
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "questionBank:update" ? state.update : vi.fn(),
  useAction: () => vi.fn(),
}));
import CourseQuestionBank from "@/app/[lang]/(app)/dashboard/courses/[id]/questions/page";

it("keeps unsaved edits through remote updates and accepts multiple tags", async () => {
  const params = Promise.resolve({ id: "course-id" });
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<CourseQuestionBank params={params} />); });
  fireEvent.click(await screen.findByRole("button", { name: /Original/ }));
  const prompt = await screen.findByLabelText("Question");
  await waitFor(() => expect(prompt).toHaveValue("Original"));
  fireEvent.change(prompt, { target: { value: "Local work" } });
  const topics = screen.getByLabelText("Topics (comma-separated)");
  fireEvent.change(topics, { target: { value: "First, Second" } });
  state.saved = { ...state.saved, revision: 1, prompt: "Remote work" };
  view.rerender(<CourseQuestionBank params={params} />);
  expect(prompt).toHaveValue("Local work");
  expect(topics).toHaveValue("First, Second");
  fireEvent.click(screen.getByRole("button", { name: "Save question" }));
  await waitFor(() => expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 0, item: expect.objectContaining({ topics: ["First", "Second"] }) })));
});
