import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import HoldToConfirm from "@/components/workspace/HoldToConfirm";

afterEach(() => vi.useRealTimers());

describe("hold to confirm", () => {
  it("confirms once from a keyboard or screen-reader click", () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Delete forever" onConfirm={onConfirm} />);
    const button = screen.getByRole("button", { name: "Delete forever" });
    fireEvent.click(button, { detail: 0 });
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("ignores a plain mouse click and confirms only after the full hold", () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Delete forever" onConfirm={onConfirm} duration={1000} />);
    const button = screen.getByRole("button", { name: "Delete forever" });
    button.setPointerCapture = vi.fn();
    fireEvent.click(button, { detail: 1 });
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    act(() => vi.advanceTimersByTime(999));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels when the press ends early", () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Delete forever" onConfirm={onConfirm} duration={1000} />);
    const button = screen.getByRole("button", { name: "Delete forever" });
    button.setPointerCapture = vi.fn();
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(button, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(1000));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
