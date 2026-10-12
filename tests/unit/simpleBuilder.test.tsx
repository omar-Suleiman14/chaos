import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FieldEditor from "@/components/forms/builder/FieldEditor";
import BuildTab from "@/components/forms/builder/BuildTab";
import FormRenderer from "@/components/forms/FormRenderer";
import { blankField, emptyDefinition, formAuthoringDirection } from "@/convex/formLogic";
import type { Answers, FormDefinition, FormField } from "@/convex/formLogic";

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

function Builder({ initial }: { initial: FormDefinition }) {
  const [def, setDef] = useState(initial);
  return <BuildTab def={def} change={(updater) => setDef(updater)} readOnly={false} notice={vi.fn()} />;
}

describe("adding questions", () => {
  it("adds a ready-to-type single-choice question in one click and shows its type beside it", () => {
    render(<Builder initial={emptyDefinition("Example")} />);
    expect(screen.getByText("Start with your first question")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    expect(screen.getByPlaceholderText("Type your question")).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Question type" })).toHaveTextContent("Single choice");
    expect(screen.getByRole("textbox", { name: "Options 2" })).toHaveValue("Option 2");
  });

  it("adds the next option when Enter is pressed in an option", () => {
    render(<Builder initial={{ ...emptyDefinition("Example"), fields: [blankField("choice")] }} />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Options 2" }), { key: "Enter" });
    expect(screen.getByRole("textbox", { name: "Options 3" })).toHaveValue("Option 3");
  });
});

describe("question expansion", () => {
  const definition = () => ({ ...emptyDefinition("Example"), fields: [
    { ...blankField("text"), label: "First question" },
    { ...blankField("text"), label: "Second question" },
  ] });

  it("opens every question by default and toggles all questions together", () => {
    render(<Builder initial={definition()} />);
    expect(screen.getAllByPlaceholderText("Type your question")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByPlaceholderText("Type your question")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getAllByPlaceholderText("Type your question")).toHaveLength(2);
  });

  it("collapses individual questions independently and handles a mixed state", () => {
    render(<Builder initial={definition()} />);
    const first = screen.getByRole("button", { name: /First question/, expanded: true });
    const second = screen.getByRole("button", { name: /Second question/, expanded: true });
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(second).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "false");
  });

  it("opens a newly added question while keeping collapsed questions closed", () => {
    render(<Builder initial={definition()} />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    expect(screen.getByPlaceholderText("Type your question")).toHaveFocus();
    expect(screen.getByRole("button", { name: /First question/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();
  });

  it("updates branching labels and preserves other edits in memoized questions", () => {
    const def = definition();
    def.fields[1].showIf = { match: "all", conditions: [{ fieldId: def.fields[0].id, op: "answered" }] };
    render(<Builder initial={def} />);
    expect(screen.getByRole("combobox", { name: "Question" })).toHaveTextContent("First question");
    fireEvent.change(screen.getAllByPlaceholderText("Type your question")[0], { target: { value: "Renamed question" } });
    expect(screen.getByRole("combobox", { name: "Question" })).toHaveTextContent("Renamed question");
    fireEvent.change(screen.getAllByPlaceholderText("Type your question")[1], { target: { value: "Edited second question" } });
    expect(screen.getAllByPlaceholderText("Type your question")[0]).toHaveValue("Renamed question");
  });
});

describe("Arabic form authoring", () => {
  it("mirrors the question editor for an Arabic form even when its stored main language is English", () => {
    const arabic = { ...emptyDefinition("ابدأ فترتك التجريبية"), fields: [{
      ...blankField("choice"), label: "بتدير إيه حاليًا؟",
      options: [{ id: "a1", label: "عيادة واحدة" }, { id: "a2", label: "مركز طبي" }],
    }] };
    expect(arabic.defaultLanguage).toBe("en");
    expect(formAuthoringDirection(arabic)).toBe("rtl");

    const { container } = render(<Builder initial={arabic} />);
    expect(container.querySelector(".ws-form-authoring")).toHaveAttribute("dir", "rtl");
    expect(screen.getByPlaceholderText("Type your question")).toHaveAttribute("dir", "auto");
    expect(screen.getByRole("textbox", { name: "Options 1" })).toHaveAttribute("dir", "auto");
    expect(screen.getByRole("textbox", { name: "Options 1" })).toHaveValue("عيادة واحدة");
  });

  it("keeps intentionally Arabic forms RTL and ordinary English forms LTR", () => {
    const en = emptyDefinition("Clinic registration");
    const ar = { ...emptyDefinition("Clinic registration"), defaultLanguage: "ar" as const, languages: ["ar" as const] };
    expect(formAuthoringDirection(en)).toBe("ltr");
    expect(formAuthoringDirection(ar)).toBe("rtl");
    const { container, rerender } = render(<Builder key="english" initial={en} />);
    expect(container.querySelector(".ws-form-authoring")).toHaveAttribute("dir", "ltr");
    rerender(<Builder key="arabic" initial={ar} />);
    // BuildTab also updates when the main language is changed in the same editor session.
    expect(container.querySelector(".ws-form-authoring")).toHaveAttribute("dir", "rtl");
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
