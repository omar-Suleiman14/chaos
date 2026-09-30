import { useEffect, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldEditor from "@/components/forms/builder/FieldEditor";
import FormRenderer from "@/components/forms/FormRenderer";
import { blankField, emptyDefinition } from "@/convex/formLogic";
import type { AnswerValue, Answers, FormField } from "@/convex/formLogic";

vi.mock("@/lib/sfx", () => ({ sfx: { play: vi.fn() } }));
vi.mock("@/components/forms/formThemes.css", () => ({}));
vi.mock("@/lib/haptics", () => ({ haptics: { error: vi.fn(), light: vi.fn(), medium: vi.fn(), select: vi.fn() } }));

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
  Element.prototype.scrollIntoView = vi.fn();
});

const seen: { answers: Answers } = { answers: {} };
const latest = new Proxy({} as Answers, { get: (_t, key) => seen.answers[key as string], has: (_t, key) => key in seen.answers });
function Respond({ field }: { field: FormField }) {
  const [answers, setAnswers] = useState<Answers>({});
  useEffect(() => { seen.answers = answers; }, [answers]);
  const def = { ...emptyDefinition("Example"), presentation: "page" as const, fields: [field] };
  return <FormRenderer skipCover definition={def} language="en" answers={answers}
    onAnswer={(id: string, value: AnswerValue | undefined) => setAnswers((a) => { const next = { ...a }; if (value === undefined) delete next[id]; else next[id] = value; return next; })} onSubmit={vi.fn()} />;
}

function Editor({ initial }: { initial: FormField }) {
  const [field, setField] = useState(initial);
  const def = { ...emptyDefinition("Example"), fields: [field] };
  return <FieldEditor field={field} index={0} def={def} onChange={setField} onDuplicate={vi.fn()} onRemove={vi.fn()} onMove={vi.fn()} />;
}

describe("number field in the respondent form", () => {
  const number: FormField = { id: "n", type: "number", label: "Amount", required: false, step: 0.01 };

  it("stores a plain number from typed text, including a decimal comma and Arabic digits", () => {
    render(<Respond field={number} />);
    const input = screen.getByLabelText("Amount");
    fireEvent.change(input, { target: { value: "12,5" } });
    expect(latest.n).toBe(12.5);
    fireEvent.change(input, { target: { value: "١٢٫٧٥" } });
    expect(latest.n).toBe(12.75);
  });

  it("stores nothing for an empty field and keeps invalid text instead of turning it into zero", () => {
    render(<Respond field={number} />);
    const input = screen.getByLabelText("Amount");
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.change(input, { target: { value: "" } });
    expect("n" in latest).toBe(false);
    fireEvent.change(input, { target: { value: "abc" } });
    expect(latest.n).toBe("abc");
  });
});

describe("rating field in the respondent form", () => {
  const rating: FormField = { id: "r", type: "rating", label: "How was it", required: false, max: 5 };

  it("can be set and then cleared with a keyboard-reachable button", () => {
    render(<Respond field={rating} />);
    expect(screen.queryByRole("button", { name: /Clear answer/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "4 / 5" }));
    expect(latest.r).toBe(4);
    const clear = screen.getByRole("button", { name: "Clear answer for How was it" });
    expect(clear.tagName).toBe("BUTTON");
    expect(clear).not.toHaveAttribute("tabindex", "-1");
    fireEvent.click(clear);
    expect("r" in latest).toBe(false);
    expect(screen.getByRole("radio", { name: "4 / 5" })).not.toBeChecked();
  });

  it("offers no clear control on a required rating", () => {
    render(<Respond field={{ ...rating, required: true }} />);
    fireEvent.click(screen.getByRole("radio", { name: "2 / 5" }));
    expect(screen.queryByRole("button", { name: /Clear answer/ })).not.toBeInTheDocument();
  });
});

describe("scale field in the respondent form", () => {
  it("shows endpoint labels, announces each value's range and honours the step", () => {
    render(<Respond field={{ id: "s", type: "scale", label: "Likely?", required: false, min: 0, max: 10, step: 5, minLabel: "Unlikely", maxLabel: "Very likely" }} />);
    expect(screen.getByText("Unlikely")).toBeInTheDocument();
    expect(screen.getByText("Very likely")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(screen.getByRole("radio", { name: "5, from 0 to 10" }));
    expect(latest.s).toBe(5);
  });
});

describe("date and time fields in the respondent form", () => {
  it("passes the earliest and latest values to the input", () => {
    render(<Respond field={{ id: "d", type: "date", label: "When", required: false, minValue: "2026-01-01", maxValue: "2026-12-31" }} />);
    const input = screen.getByLabelText("When");
    expect(input).toHaveAttribute("min", "2026-01-01");
    expect(input).toHaveAttribute("max", "2026-12-31");
    fireEvent.change(input, { target: { value: "2026-03-08" } });
    expect(latest.d).toBe("2026-03-08");
  });
});

describe("builder", () => {
  it("states that Chaos does not verify email addresses", () => {
    render(<Editor initial={{ ...blankField("email"), label: "Email" }} />);
    expect(screen.getByTestId("email-unverified-note")).toHaveTextContent("Email addresses aren’t verified");
  });

  it("authors number limits, step and whole-number mode", () => {
    render(<Editor initial={{ ...blankField("number"), label: "Age" }} />);
    fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "99" } });
    fireEvent.change(screen.getByLabelText("Step"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Whole numbers only" }));
    expect(screen.getByLabelText("Minimum")).toHaveValue(1);
    expect(screen.getByLabelText("Maximum")).toHaveValue(99);
    expect(screen.getByLabelText("Step")).toHaveValue(1);
    expect(screen.getByRole("checkbox", { name: "Whole numbers only" })).toBeChecked();
  });

  it("authors date bounds and scale endpoint labels", () => {
    const { unmount } = render(<Editor initial={{ ...blankField("date"), label: "Day" }} />);
    fireEvent.change(screen.getByLabelText("Earliest date"), { target: { value: "2026-01-01" } });
    expect(screen.getByLabelText("Earliest date")).toHaveValue("2026-01-01");
    unmount();
    render(<Editor initial={{ ...blankField("scale"), label: "Rate" }} />);
    fireEvent.change(screen.getByLabelText("Low label"), { target: { value: "Bad" } });
    fireEvent.change(screen.getByLabelText("High label"), { target: { value: "Good" } });
    expect(screen.getByLabelText("Low label")).toHaveValue("Bad");
    expect(screen.getByLabelText("High label")).toHaveValue("Good");
  });
});
