import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FlashcardsHub from "@/components/learn/FlashcardsHub";
import CoursesHub from "@/components/courses/CoursesHub";

const data = vi.hoisted(() => ({ sets: [] as unknown[] | undefined, courses: [] as unknown[] | undefined }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/learn/data", () => ({ useFlashcardSets: () => data.sets, useLearnActions: () => ({ createFlashcardSet: vi.fn() }) }));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: () => data.courses }));

const deck = { id: "d", title: "Verbs", published: false, updatedAt: 1, cards: [{ id: "c", front: "Q", back: "A" }], description: "", visibility: "private" };
const course = { id: "c", title: "Anatomy", published: false, updatedAt: 1, lessons: 2, visibility: "private", archived: false };
const illustration = () => document.querySelector(".state-illustration");

beforeEach(() => { data.sets = []; data.courses = []; });

describe("flashcards empty states", () => {
  it("shows the skeleton, not an illustration, while loading", () => {
    data.sets = undefined;
    render(<FlashcardsHub embedded />);
    expect(illustration()).toBeNull();
  });

  it("draws the learning illustration, hidden from screen readers, with the heading and create action", () => {
    render(<FlashcardsHub embedded />);
    expect(screen.getByRole("heading", { name: "No flashcard sets" })).toBeInTheDocument();
    expect(illustration()).toHaveAttribute("data-variant", "learn");
    expect(illustration()).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "New set" })).toBeInTheDocument();
  });

  it("dims only the small icons in Learn empty states, never the illustration", () => {
    const css = readFileSync(join(process.cwd(), "components/learn/learn.css"), "utf8");
    expect(css).toContain(".lx-empty svg:not(.state-illustration) { opacity: .7; }");
  });

  it("draws the no-results illustration when a search hides every set, and nothing when sets are shown", () => {
    data.sets = [deck];
    const { rerender } = render(<FlashcardsHub embedded search="zzz" />);
    expect(screen.getByRole("heading", { name: "Nothing matches" })).toBeInTheDocument();
    expect(illustration()).toHaveAttribute("data-variant", "search");
    rerender(<FlashcardsHub embedded />);
    expect(illustration()).toBeNull();
    expect(screen.getByText("Verbs")).toBeInTheDocument();
  });
});

describe("courses empty states", () => {
  it("shows the skeleton, not an illustration, while loading", () => {
    data.courses = undefined;
    render(<CoursesHub embedded />);
    expect(illustration()).toBeNull();
  });

  it("draws the learning illustration above the first-course prompt in the Library", () => {
    render(<CoursesHub embedded />);
    expect(screen.getByRole("heading", { name: "Create your first course" })).toBeInTheDocument();
    expect(illustration()).toHaveAttribute("data-variant", "learn");
  });

  it("draws the no-results illustration when a status filter hides every course", () => {
    data.courses = [course];
    render(<CoursesHub embedded statuses={["live"]} />);
    expect(screen.getByRole("heading", { name: "Nothing matches" })).toBeInTheDocument();
    expect(illustration()).toHaveAttribute("data-variant", "search");
  });

  it("keeps the full Courses page's New tile instead of an empty-state illustration", () => {
    render(<CoursesHub />);
    expect(illustration()).toBeNull();
  });
});
