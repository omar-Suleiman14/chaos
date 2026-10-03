import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ version: undefined as unknown, review: vi.fn().mockResolvedValue(undefined) }));
vi.mock("convex/react", () => ({ useQuery: () => mocks.version }));
vi.mock("@clerk/nextjs", () => ({ SignInButton: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/i18n", () => ({ useCopy: (copy: { en: unknown }) => copy.en }));
vi.mock("@/lib/learn/data", () => ({
  useCardReviews: () => [],
  useLearnActions: () => ({ reviewCard: mocks.review }),
  useLearnViewer: () => ({ id: "guest", signedIn: false }),
}));
vi.mock("@/components/workspace/Skeletons", () => ({ PageSkeleton: () => <p>Loading cards</p> }));
import FlashcardStudy from "@/components/learn/study/FlashcardStudy";

beforeEach(() => { mocks.version = undefined; mocks.review.mockClear(); });
describe("public inline flashcard study", () => {
  it("waits for published cards before creating the queue and lets guests rate them", async () => {
    const { rerender } = render(<FlashcardStudy setId="set" />);
    expect(screen.getByText("Loading cards")).toBeTruthy();
    mocks.version = { _id: "version", title: "Anatomy", cards: [{ id: "card", front: "Front", back: "Answer" }] };
    rerender(<FlashcardStudy setId="set" />);
    expect(screen.getByText("Card 1 of 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sign in/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Knew it" }));
    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith("set", "card", true));
    await waitFor(() => expect(screen.getByText(/Round done/)).toBeTruthy());
  });
});
