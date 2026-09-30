import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FieldEditor from "@/components/forms/builder/FieldEditor";
import FormRenderer from "@/components/forms/FormRenderer";
import { blankField, emptyDefinition } from "@/convex/formLogic";
import type { Answers, FormField } from "@/convex/formLogic";

vi.mock("@/lib/sfx", () => ({ sfx: { play: vi.fn() } }));
vi.mock("@/components/forms/formThemes.css", () => ({}));
vi.mock("@/lib/haptics", () => ({ haptics: { error: vi.fn(), light: vi.fn(), medium: vi.fn(), select: vi.fn() } }));

function Editor({ initial }: { initial: FormField }) {
  const [field, setField] = useState(initial);
  const def = { ...emptyDefinition("Example"), fields: [field] };
  return <FieldEditor field={field} index={0} def={def} onChange={setField} onDuplicate={vi.fn()} onRemove={vi.fn()} onMove={vi.fn()} />;
}

describe("question editor", () => {
  it("shows the essentials and keeps advanced options folded away", () => {
    render(<Editor initial={{ ...blankField("text"), label: "Your name" }} />);
    expect(screen.getByPlaceholderText("Type your question")).toHaveValue("Your name");
    expect(screen.getByText("More options").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByLabelText("Min characters")).not.toBeVisible();
    expect(screen.queryByPlaceholderText("Description (optional)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add a description" }));
    expect(screen.getByPlaceholderText("Description (optional)")).toBeInTheDocument();
  });

  it("toggles Required with a switch", () => {
    render(<Editor initial={{ ...blankField("text"), required: false }} />);
    const required = screen.getByRole("switch", { name: "Required" });
    expect(required).not.toBeChecked();
    fireEvent.click(required);
    expect(screen.getByRole("switch", { name: "Required" })).toBeChecked();
  });
});

describe("Typeform motion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  it("keeps the answered question briefly on screen, hidden from assistive tech, then removes it", () => {
    function Example() {
      const [answers, setAnswers] = useState<Answers>({});
      const def = { ...emptyDefinition("Example"), presentation: "conversational" as const, fields: [
        { id: "q1", type: "text" as const, label: "First", required: false },
        { id: "q2", type: "text" as const, label: "Second", required: false },
      ] };
      return <FormRenderer skipCover definition={def} language="en" answers={answers} onAnswer={(id, v) => setAnswers((a) => ({ ...a, [id]: v! }))} onSubmit={vi.fn()} />;
    }
    const { container } = render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    const leaving = container.querySelector(".form-step-leave");
    expect(leaving).toHaveAttribute("aria-hidden", "true");
    expect(leaving).toHaveAttribute("inert");
    expect(screen.getByRole("textbox", { name: /Second/ })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(600));
    expect(container.querySelector(".form-step-leave")).toBeNull();
  });
});
