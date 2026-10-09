import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FocusInput, FocusTextarea } from "@/components/InitialFocus";
import { useNow } from "@/lib/useNow";

afterEach(() => vi.useRealTimers());

it("focuses a newly requested input, forwards its ref, and keeps focus on later edits", () => {
  const ref = createRef<HTMLInputElement>();
  const view = render(<><FocusInput ref={ref} aria-label="Name" focusOnMount /><button>Next</button></>);
  expect(ref.current).toBe(screen.getByRole("textbox", { name: "Name" }));
  expect(ref.current).toHaveFocus();
  screen.getByRole("button", { name: "Next" }).focus();
  view.rerender(<><FocusInput ref={ref} aria-label="Name" focusOnMount defaultValue="Edited" /><button>Next</button></>);
  expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
});

it("leaves focus alone until textarea focus is explicitly requested", () => {
  const view = render(<FocusTextarea aria-label="Note" focusOnMount={false} />);
  expect(screen.getByRole("textbox")).not.toHaveFocus();
  view.rerender(<FocusTextarea aria-label="Note" focusOnMount />);
  expect(screen.getByRole("textbox")).toHaveFocus();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hello" } });
  expect(screen.getByRole("textbox")).toHaveValue("Hello");
});

it("updates displayed time and clears its clock on unmount", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  function Clock() { return <span>{useNow(100)}</span>; }
  const view = render(<Clock />);
  expect(screen.getByText("1000")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(100));
  expect(screen.getByText("1100")).toBeInTheDocument();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
