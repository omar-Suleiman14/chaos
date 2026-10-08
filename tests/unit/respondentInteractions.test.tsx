import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FormRenderer from "@/components/forms/FormRenderer";
import { emptyDefinition } from "@/convex/formLogic";
import type { Answers, FormDefinition } from "@/convex/formLogic";

vi.mock("@/lib/sfx", () => ({ sfx: { play: vi.fn() } }));
vi.mock("@/components/forms/formThemes.css", () => ({}));
vi.mock("@/lib/haptics", () => ({ haptics: { error: vi.fn(), light: vi.fn(), medium: vi.fn(), select: vi.fn() } }));

const choice = (id: string) => ({ id, type: "choice" as const, label: `Question ${id}`, required: true, options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] });
function Example({ mode = "conversational", count = 2, submit = vi.fn() }: { mode?: FormDefinition["presentation"]; count?: number; submit?: () => void }) {
  const [answers, setAnswers] = useState<Answers>({});
  const def = { ...emptyDefinition("Example"), presentation: mode, fields: Array.from({ length: count }, (_, i) => choice(String(i + 1))) };
  return <FormRenderer skipCover definition={def} language="en" answers={answers} onAnswer={(id, value) => setAnswers((a) => ({ ...a, [id]: value! }))} onSubmit={submit} />;
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.useRealTimers());

describe.each(["conversational", "swipe"] as const)("%s respondent controls", (mode) => {
  it("advances earlier choices, moves focus, and requires explicit final submission", () => {
    const submit = vi.fn();
    render(<Example mode={mode} submit={submit} />);
    fireEvent.click(screen.getAllByRole("radio", { name: "Alpha" })[0]);
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByRole("group", { name: /Question 2/ })).toHaveFocus();
    fireEvent.click(screen.getByRole("radio", { name: "Beta" }));
    act(() => vi.advanceTimersByTime(1000));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.wheel(screen.getByRole("radio", { name: "Beta" }), { deltaY: 100 });
    fireEvent.keyDown(screen.getByRole("radio", { name: "Beta" }), { key: "Enter" });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("scopes shortcuts and radio groups to the focused renderer", () => {
    render(<><section aria-label="First"><Example mode={mode} count={1} /></section><section aria-label="Second"><Example mode={mode} count={1} /></section></>);
    const first = within(screen.getByRole("region", { name: "First" }));
    const second = within(screen.getByRole("region", { name: "Second" }));
    const radio = second.getByRole("radio", { name: "Alpha" });
    radio.focus();
    fireEvent.keyDown(radio, { key: "b" });
    expect(second.getByRole("radio", { name: "Beta" })).toBeChecked();
    expect(first.getByRole("radio", { name: "Beta" })).not.toBeChecked();
    expect(radio.getAttribute("name")).not.toBe(first.getByRole("radio", { name: "Alpha" }).getAttribute("name"));
  });
});

it.each(["conversational", "swipe"] as const)("submits from a final text answer with Enter in %s mode", (mode) => {
  const submit = vi.fn();
  function TextExample() {
    const [answers, setAnswers] = useState<Answers>({});
    const def = { ...emptyDefinition("Example"), presentation: mode, fields: [{ id: "name", type: "text" as const, label: "Your name", required: true }] };
    return <FormRenderer skipCover definition={def} language="en" answers={answers} onAnswer={(id, value) => setAnswers((a) => ({ ...a, [id]: value! }))} onSubmit={submit} />;
  }
  render(<TextExample />);
  const input = screen.getByRole("textbox", { name: /Your name/ });
  fireEvent.change(input, { target: { value: "Sam" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(submit).toHaveBeenCalledTimes(1);
});

it("preserves native radio arrow keys in swipe mode", () => {
  render(<Example mode="swipe" />);
  const radio = screen.getAllByRole("radio", { name: "Alpha" })[0];
  radio.focus();
  expect(fireEvent.keyDown(radio, { key: "ArrowDown" })).toBe(true);
  expect(screen.getByRole("group", { name: /Question 1/ })).toBeVisible();
  expect(radio).toHaveFocus();
});

it("does not steal focus from controls outside a mounted preview", () => {
  render(<button>Outside</button>);
  screen.getByRole("button", { name: "Outside" }).focus();
  const outside = screen.getByRole("button", { name: "Outside" });
  outside.focus();
  render(<Example />);
  expect(outside).toHaveFocus();
  fireEvent.keyDown(outside, { key: "b" });
  expect(screen.getByRole("radio", { name: "Beta" })).not.toBeChecked();
});

it("renders form text as literal text", () => {
  const title = "<b>Example title</b>";
  const label = "<em>Example question</em>";
  const def = { ...emptyDefinition(title), presentation: "page" as const, fields: [{ id: "name", type: "text" as const, label, required: false }] };
  const { container } = render(<FormRenderer skipCover definition={def} language="en" answers={{}} onAnswer={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.getByText(title)).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: label })).toBeInTheDocument();
  expect(container.querySelector("b, em")).toBeNull();
});
