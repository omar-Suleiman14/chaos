import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { AnswerTile } from "@/components/live/tiles";
import { Countdown, useSecondsLeft } from "@/components/live/clock";
import {
  answerPoints, cleanNickname, clockOffset, isCorrectAnswer, isProfane, nicknameProblem, questionsFromForm,
  rankScores, secondsLeft, streakBonus,
} from "@/convex/liveLogic";
import { emptyDefinition } from "@/convex/formLogic";
import { gradeQuiz } from "@/convex/formQuiz";
import { renderHook } from "@testing-library/react";

describe("AnswerTile", () => {
  it("is a button named by its shape and answer", () => {
    const onSelect = vi.fn();
    render(<AnswerTile index={0} label="Paris" onSelect={onSelect} showLabel={false} />);
    const tile = screen.getByRole("button", { name: "Triangle: Paris" });
    expect(tile).toHaveAttribute("data-shape", "triangle");
    expect(tile).toHaveAttribute("aria-keyshortcuts", "1");
    expect(screen.queryByText("Paris")).toBeNull(); // hosts can explicitly choose symbols-only play
    fireEvent.click(tile);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("uses four distinct shapes in order and works as a toggle for checkboxes", () => {
    render(<>{["a", "b", "c", "d"].map((l, i) => <AnswerTile key={l} index={i} label={l} toggle selected={i === 2} onSelect={() => {}} />)}</>);
    const tiles = screen.getAllByRole("button");
    expect(tiles.map((t) => t.getAttribute("data-shape"))).toEqual(["triangle", "diamond", "circle", "square"]);
    expect(tiles[2]).toHaveAttribute("aria-pressed", "true");
    expect(tiles[0]).toHaveAttribute("aria-pressed", "false");
  });

  it("announces the result and vote count after the reveal", () => {
    render(<AnswerTile index={1} label="Rome" result="wrong" count={3} size="host" />);
    expect(screen.getByRole("listitem", { name: "Diamond: Rome (Not correct, 3 answers)" })).toBeInTheDocument();
  });

  it("does not respond when disabled", () => {
    const onSelect = vi.fn();
    render(<AnswerTile index={3} label="x" disabled onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("names shapes in Arabic", () => {
    render(<LocaleProvider initial="ar"><AnswerTile index={2} label="أوسلو" onSelect={() => {}} /></LocaleProvider>);
    expect(screen.getByRole("button", { name: "دائرة: أوسلو" })).toBeInTheDocument();
  });

  it("shows the answer text by default and inherits its theme palette", () => {
    render(<AnswerTile index={0} label="Paris" onSelect={() => {}} />);
    expect(screen.getByText("Paris")).toBeVisible();
    expect(screen.getByRole("button")).not.toHaveAttribute("style");
  });
});

describe("Countdown", () => {
  it("counts down from the server's end time, corrected by the clock offset", () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      // The device clock is 3 s behind the server, so 13 s of server time are left, not 10.
      const { rerender } = render(<Countdown endsAt={now + 10_000} total={20} offset={-3_000} />);
      expect(screen.getByTestId("countdown-value")).toHaveTextContent("13");
      rerender(<Countdown endsAt={now + 10_000} total={20} offset={0} />);
      expect(screen.getByTestId("countdown-value")).toHaveTextContent("10");
      act(() => { vi.advanceTimersByTime(4_000); });
      expect(screen.getByTestId("countdown-value")).toHaveTextContent("6");
      expect(screen.getByRole("timer")).toHaveAccessibleName("6 seconds left");
      act(() => { vi.advanceTimersByTime(20_000); });
      expect(screen.getByTestId("countdown-value")).toHaveTextContent("0");
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces at 10 and 5 seconds and when time is up", () => {
    vi.useFakeTimers();
    try {
      const onAnnounce = vi.fn();
      render(<Countdown endsAt={Date.now() + 12_000} total={20} offset={0} onAnnounce={onAnnounce} />);
      for (let i = 0; i < 52; i++) act(() => { vi.advanceTimersByTime(250); });
      expect(onAnnounce.mock.calls.map((c) => c[0])).toEqual(["10 seconds left", "5 seconds left", "Time is up"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("useSecondsLeft is 0 without an end time", () => {
    const { result } = renderHook(() => useSecondsLeft(null, 0));
    expect(result.current).toBe(0);
  });
});

describe("live rules", () => {
  it("scores 500–1000 by speed and 0 when wrong", () => {
    expect(answerPoints(true, 0, 20_000)).toBe(1000);
    expect(answerPoints(true, 5_000, 20_000)).toBe(875);
    expect(answerPoints(true, 20_000, 20_000)).toBe(500);
    expect(answerPoints(true, 99_000, 20_000)).toBe(500);
    expect(answerPoints(false, 0, 20_000)).toBe(0);
  });

  it("adds +100 per consecutive correct answer after the second, capped at +500", () => {
    expect([1, 2, 3, 4, 7, 8, 20].map(streakBonus)).toEqual([0, 0, 100, 200, 500, 500, 500]);
  });

  it("ranks ties together", () => {
    expect(rankScores([{ score: 5 }, { score: 9 }, { score: 5 }, { score: 1 }]).map((p) => p.rank)).toEqual([1, 2, 2, 4]);
  });

  it("uses the normal quiz grading for form and old quiz questions", () => {
    const def = emptyDefinition("Q");
    def.quiz = { enabled: true };
    def.fields = [
      { id: "a", type: "multi_choice", label: "A", required: true, options: [{ id: "x", label: "X" }, { id: "y", label: "Y" }, { id: "z", label: "Z" }], quiz: { correctOptionIds: ["x", "y"], points: 1 } },
      { id: "b", type: "choice", label: "B", required: true, options: Array.from({ length: 5 }, (_, i) => ({ id: `o${i}`, label: `${i}` })), quiz: { correctOptionIds: ["o1"], points: 1 } },
    ];
    const { questions, skipped } = questionsFromForm(def);
    expect(skipped).toBe(1); // five options do not fit on four tiles
    for (const chosen of [["x", "y"], ["y", "x"], ["x"], ["x", "y", "z"]]) {
      expect(isCorrectAnswer(questions[0], chosen)).toBe((gradeQuiz(def, { a: chosen })!.score) > 0);
    }
  });

  it("cleans and checks nicknames", () => {
    expect(cleanNickname("  Sam​  the\tGreat ")).toBe("Sam the Great");
    expect(nicknameProblem("")).toBe("empty");
    expect(nicknameProblem("a".repeat(21))).toBe("too_long");
    expect(nicknameProblem("<script>")).toBe("characters");
    expect(nicknameProblem("سارة")).toBeNull();
    expect(isProfane("sh1thead")).toBe(true);
    expect(isProfane("F.U.C.K")).toBe(true);
    expect(isProfane("كس")).toBe(true);
    expect(isProfane("Dickens")).toBe(false);
    expect(isProfane("grape")).toBe(false);
  });

  it("corrects for clock skew", () => {
    expect(clockOffset(1000, 1200, 5100)).toBe(4000);
    expect(secondsLeft(20_000, 10_000, 0)).toBe(10);
    expect(secondsLeft(20_000, 10_000, 9_500)).toBe(1);
    expect(secondsLeft(20_000, 30_000, 0)).toBe(0);
  });
});
