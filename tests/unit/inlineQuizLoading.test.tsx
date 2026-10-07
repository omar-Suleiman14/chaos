import { Suspense, lazy } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";

const pending = vi.hoisted(() => ({ resolve: [] as Array<() => void>, warm: vi.fn() }));
// Match app-router next/dynamic: without a loading option it has no local boundary.
vi.mock("next/dynamic", () => ({ default: () => lazy(() => new Promise<{ default: () => React.ReactNode }>(resolve => {
  pending.resolve.push(() => resolve({ default: () => <div>Loaded player</div> }));
})) }));
vi.mock("@/lib/convexCache", () => ({ warmQuery: pending.warm, useQuery: () => ({ title: "Checkpoint", questionCount: 1, href: "/f/checkpoint", shareId: "checkpoint" }) }));
vi.mock("@/components/forms/respond/RespondPage", () => ({ RespondToForm: () => null }));
vi.mock("@/components/quizzes/QuizPlayer", () => ({ default: () => null }));
vi.mock("convex/react", () => ({ useQuery: () => ({ title: "Cards", cardCount: 2 }) }));
vi.mock("@/components/learn/reader/LazyBlock", async importOriginal => ({
  ...await importOriginal<typeof import("@/components/learn/reader/LazyBlock")>(),
  useNearViewport: () => [{ current: null }, true],
}));
vi.mock("@/components/site/SiteLink", () => ({ default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

import InlineQuiz from "@/components/learn/reader/InlineQuiz";
import InlineFlashcards from "@/components/learn/reader/InlineFlashcards";
import { api } from "@/convex/_generated/api";

describe("inline quiz lazy loading", () => {
  it.each(["form", "quiz"] as const)("keeps the lesson visible while the %s player downloads", async kind => {
    render(<LocaleProvider initial="en"><Suspense fallback={<div>Lesson loading</div>}>
      <article><h1>Lesson content</h1><InlineQuiz asset={{ kind, id: "checkpoint" }} /></article>
    </Suspense></LocaleProvider>);
    if (kind === "quiz") fireEvent.click(screen.getByRole("button", { name: "Start practice" }));
    expect(screen.queryByText("Lesson loading")).toBeNull();
    expect(screen.getByRole("heading", { name: "Lesson content" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveStyle({ minHeight: "280px" });
    if (kind === "form") expect(pending.warm).toHaveBeenCalledWith(api.respond.getPublicForm, { shareId: "checkpoint" });
    else expect(pending.warm).toHaveBeenCalledWith(api.quizFunctions.getQuizForPlayer, { quizId: "checkpoint" });
    await act(async () => { pending.resolve.shift()!(); });
    expect(screen.getByText("Loaded player")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Lesson content" })).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("keeps the lesson visible while the flashcard player downloads", async () => {
    render(<LocaleProvider initial="en"><Suspense fallback={<div>Lesson loading</div>}>
      <h1>Lesson content</h1><InlineFlashcards setId="cards" />
    </Suspense></LocaleProvider>);
    expect(screen.queryByText("Lesson loading")).toBeNull();
    expect(screen.getByRole("heading", { name: "Lesson content" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveStyle({ minHeight: "300px" });
    await act(async () => { pending.resolve.shift()!(); });
    expect(screen.getByText("Loaded player")).toBeVisible();
  });
});
