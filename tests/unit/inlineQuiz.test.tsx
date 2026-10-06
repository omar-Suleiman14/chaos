import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ details: { title: "Checkpoint", shareId: "share1", href: "/f/share1", questionCount: 3 } as { title: string; shareId: string | null; href: string; questionCount: number } | null | undefined }));
vi.mock("@/lib/convexCache", () => ({ warmHref: () => {}, useQuery: () => mock.details }));
vi.mock("next/dynamic", () => ({ default: () => (props: { shareId?: string; quizId?: string; inline?: boolean; minimal?: boolean; studyProgress?: boolean }) => <div data-testid="player" data-asset={props.shareId ?? props.quizId} data-inline={String(props.inline)} data-minimal={String(!!props.minimal)} data-study={String(props.studyProgress)} /> }));
import InlineQuiz from "@/components/learn/reader/InlineQuiz";
beforeEach(() => { mock.details = { title: "Checkpoint", shareId: "share1", href: "/f/share1", questionCount: 3 }; });
it("shows form checkpoints straight away in the minimal view, and remembers a switch to full", () => {
  localStorage.removeItem("chaos-inline-quiz-view");
  const { unmount } = render(<InlineQuiz asset={{ kind: "form", id: "original" }} />);
  expect(screen.getByText(/3 questions/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open full quiz" })).toHaveAttribute("href", "/f/share1");
  const player = screen.getByTestId("player");
  expect(player).toHaveAttribute("data-asset", "share1");
  expect(player).toHaveAttribute("data-inline", "true");
  expect(player).toHaveAttribute("data-minimal", "true");
  expect(player).toHaveAttribute("data-study", "true");
  expect(screen.getByRole("button", { name: "Minimal" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Full" }));
  expect(screen.getByTestId("player")).toHaveAttribute("data-minimal", "false");
  unmount();
  render(<InlineQuiz asset={{ kind: "form", id: "original" }} />);
  expect(screen.getByTestId("player")).toHaveAttribute("data-minimal", "false");
});
it("keeps classic quiz identity and standalone URL", () => {
  mock.details = { title: "Final quiz", shareId: null, href: "/creator/final", questionCount: 60 };
  render(<InlineQuiz asset={{ kind: "quiz", id: "classic-original" }} />);
  expect(screen.getByRole("link", { name: "Open full quiz" })).toHaveAttribute("href", "/creator/final");
  fireEvent.click(screen.getByRole("button", { name: "Start practice" }));
  expect(screen.getByTestId("player")).toHaveAttribute("data-asset", "classic-original");
});
it("does not expose controls for unavailable assessments", () => {
  mock.details = null;
  render(<InlineQuiz asset={{ kind: "form", id: "closed" }} />);
  expect(screen.getByText("This quiz is unavailable.")).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
});
