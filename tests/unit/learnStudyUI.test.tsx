import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { LocaleProvider } from "@/lib/i18n";
import type { Lesson } from "@/lib/learn/types";

const state = vi.hoisted(() => ({ push: vi.fn(), query: vi.fn(), mutation: vi.fn(), reads: {} as Record<string, unknown> }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }), useConvex: () => ({ query: state.query, mutation: state.mutation }),
  useMutation: () => state.mutation,
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => args === "skip" ? undefined : state.reads[getFunctionName(ref)],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/components/live/HostLiveButton", () => ({ useHostLive: () => ({ busy: false, start: vi.fn(), label: "Host live" }) }));
vi.mock("@/lib/learn/data", () => ({
  useLessonFlashcards: () => [], useLearnViewer: () => ({ id: "me", name: "Me", signedIn: true }),
  usePerson: () => ({ id: "me", name: "Me", username: "me", bio: "", affiliations: [], verifications: [{ kind: "student", status: "verified", institution: "Fake local badge" }], lessons: [], flashcards: [] }),
  useLearnActions: () => ({ updateProfile: vi.fn() }), useLearnCapabilities: () => ({ verification: false, quizForks: false, weakAreas: false }), useProgress: () => ({}),
}));
import PracticeTab from "@/components/learn/reader/PracticeTab";
import ProfilePage from "@/app/dashboard/learn/profile/page";
import WeakAreas from "@/components/learn/WeakAreas";
import ProfileView from "@/components/learn/ProfileView";

const lesson = { id: "lesson", quizzes: [] } as unknown as Lesson;
const wrap = (ui: React.ReactNode) => render(<LocaleProvider initial="en">{ui}</LocaleProvider>);
beforeEach(() => { state.push.mockReset(); state.query.mockReset(); state.mutation.mockReset(); state.reads = { "learnFrontend:attachedQuizzes": [], "forms:listMyForms": { owned: [], shared: [] } }; });
describe("durable study UI", () => {
  it.each(["form", "quiz"])("copies %s into a NEW draft and navigates its existing builder route", async kind => {
    state.reads["learnFrontend:attachedQuizzes"] = [{ kind, id: "original", title: "Published", shareId: "public", href: "/creator/original", questionCount: 1 }];
    state.query.mockResolvedValue(kind === "form" ? { formVersionId: "publication" } : { expectedPublishedAt: 12 });
    state.mutation.mockResolvedValue({ asset: { kind, id: "new-draft" } });
    wrap(<PracticeTab lesson={lesson} isOwner={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy to my library" }));
    await waitFor(() => expect(state.push).toHaveBeenCalledWith(kind === "form" ? "/dashboard/forms/new-draft" : "/dashboard/editor?id=new-draft"));
  });
  it("shows fork failure and keeps the current route", async () => {
    state.reads["learnFrontend:attachedQuizzes"] = [{ kind: "form", id: "original", title: "Published", shareId: "public", href: "/f/public", questionCount: 1 }];
    state.query.mockResolvedValue({ formVersionId: "publication" }); state.mutation.mockRejectedValue(new Error("Publication changed"));
    wrap(<PracticeTab lesson={lesson} isOwner={false} />); fireEvent.click(screen.getByRole("button", { name: "Copy to my library" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Publication changed"); expect(state.push).not.toHaveBeenCalled();
  });
  it("submits affiliation via backend despite old false capabilities and collects no evidence files", async () => {
    state.reads["learnCommunity:getMyClaims"] = []; state.mutation.mockResolvedValue("claim");
    const { container } = wrap(<ProfilePage />);
    expect(container.querySelector('input[type="file"]')).toBeNull(); expect(container.querySelector('input[type="email"]')).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Institution" }), { target: { value: " University " } });
    fireEvent.click(screen.getByRole("button", { name: "Request verification" }));
    await screen.findByText("Affiliation claim submitted for review.");
    expect(state.mutation.mock.calls[0][1]).toEqual({ role: "student", institution: "University" });
    expect(screen.queryByText("Fake local badge")).toBeNull();
  });
  it("public profile ignores local verified claims and relies on current backend roles", () => {
    state.reads["learnStudyReads:publicIdentity"] = [];
    wrap(<ProfileView id="me" />); expect(screen.queryByText("Fake local badge")).toBeNull(); expect(screen.queryByText(/Badges confirm identity/)).toBeNull();
  });
  it("removes a public badge at expiry while the profile stays open", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000); state.reads["learnStudyReads:publicIdentity"] = [{ kind: "student", expiresAt: 1100 }];
      wrap(<ProfileView id="me" />); expect(screen.getByText(/Badges confirm identity/)).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(101); });
      expect(screen.queryByText(/Badges confirm identity/)).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it("renders explainable insufficient evidence with no fabricated percentage or mastery", () => {
    state.reads["learnStudyReads:myConcepts"] = { concepts: [{ id: "cells", title: "Cells" }], truncated: false };
    state.reads["learnPractice:conceptStates"] = [{ conceptId: "cells", state: "insufficient", attempts: 0, accuracy: null, lastAnsweredAt: null, confidence: "low", reason: "Fewer than three independent completed responses in the last 30 days." }];
    state.reads["learnPractice:selectPractice"] = [];
    wrap(<WeakAreas />);
    expect(screen.getByText("Insufficient evidence")).toBeInTheDocument(); expect(screen.getByText("0 independent completed responses (last 30 days)")).toBeInTheDocument();
    expect(screen.queryByText(/Average server-graded accuracy:/)).toBeNull(); expect(screen.getByText(/Fewer than three/)).toBeInTheDocument();
  });
});
