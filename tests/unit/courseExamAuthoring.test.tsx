import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  draft: { _id:"draft-id", revision:0, title:"Original exam", targetCount:1,
    allocations:[{id:"all",kind:"course",key:"",count:1,points:1}], selections:[] },
  save: vi.fn(async () => 1),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href:string }) => <a href={href}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/i18n", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/i18n")>()), useLocale: () => ({ locale:"en" }) }));
vi.mock("@/components/courses/ExamReleaseSettings", () => ({ ExamReleaseSettings: () => null }));
vi.mock("@/components/courses/ExamAudienceSetup", () => ({ ExamAudienceSetup: () => null }));
vi.mock("@/components/exams/TeacherExamMonitor", () => ({ TeacherExamMonitor: () => null }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated:true }),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args:unknown) => {
    if (args === "skip") return undefined;
    switch (getFunctionName(ref)) {
      case "courses:get": return { isOwner:true };
      case "examBuilder:getDraft": return state.draft;
      case "examBuilder:preview": return { modules:[],lectures:[],topics:[],rows:[],readyQuestions:0,plannedCount:1,feasible:false,selected:[] };
      case "examBuilder:candidates": return { questions:[],total:0,nextOffset:null };
      default: return undefined;
    }
  },
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "examBuilder:savePlan" ? state.save : vi.fn(),
}));
import CourseExamBuilder from "@/app/[lang]/(app)/dashboard/courses/[id]/exams/page";

it("preserves local plan edits and submits the revision originally loaded", async () => {
  const params = Promise.resolve({ id:"course-id" }), searchParams = Promise.resolve({ draft:"draft-id" });
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<CourseExamBuilder params={params} searchParams={searchParams} />); });
  const title = await screen.findByLabelText("Exam title");
  await waitFor(() => expect(title).toHaveValue("Original exam"));
  fireEvent.change(title, { target:{ value:"Local title" } });
  state.draft = { ...state.draft, revision:1, title:"Remote title" };
  view.rerender(<CourseExamBuilder params={params} searchParams={searchParams} />);
  expect(title).toHaveValue("Local title");
  fireEvent.click(screen.getByRole("button", { name:"Save syllabus" }));
  await waitFor(() => expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision:0, title:"Local title" })));
});

it("refreshes an untouched plan after another editor changes it", async () => {
  state.draft = { ...state.draft, revision: 0, title: "Initial title" };
  const params = Promise.resolve({ id:"course-id" }), searchParams = Promise.resolve({ draft:"draft-id" });
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<CourseExamBuilder params={params} searchParams={searchParams} />); });
  const title = await screen.findByLabelText("Exam title");
  await waitFor(() => expect(title).toHaveValue("Initial title"));
  state.draft = { ...state.draft, revision: 1, title: "Updated remotely" };
  view.rerender(<CourseExamBuilder params={params} searchParams={searchParams} />);
  await waitFor(() => expect(title).toHaveValue("Updated remotely"));
});
