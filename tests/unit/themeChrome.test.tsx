import { fireEvent, within, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FormRenderer from "@/components/forms/FormRenderer";
import { themeClass } from "@/components/forms/formThemes";
import { emptyDefinition, googleFormsTheme, microsoftFormsTheme, paperTheme } from "@/convex/formLogic";
import type { Answers, FormDefinition } from "@/convex/formLogic";

vi.mock("@/lib/sfx", () => ({ sfx: { play: vi.fn() } }));
vi.mock("@/components/forms/formThemes.css", () => ({}));
vi.mock("@/lib/haptics", () => ({ haptics: { error: vi.fn(), light: vi.fn(), medium: vi.fn(), select: vi.fn() } }));

function definition(theme: FormDefinition["theme"]): FormDefinition {
  return {
    ...emptyDefinition("Team lunch"),
    description: "Pick a day",
    theme,
    fields: [
      { id: "name", type: "text", label: "Name", required: true },
      { id: "note", type: "statement", label: "Read this first", required: false },
      { id: "day", type: "choice", label: "Day", required: false, options: [{ id: "a", label: "Mon" }, { id: "b", label: "Tue" }] },
    ],
  };
}
function renderForm(def: FormDefinition, answers: Answers = {}, onAnswer = vi.fn()) {
  return render(<FormRenderer definition={def} language="en" answers={answers} onAnswer={onAnswer} onSubmit={vi.fn()} />);
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
  Element.prototype.scrollIntoView = vi.fn();
});

describe("google-forms chrome", () => {
  it("renders a title card with the accent strip and one card per question", () => {
    const { container } = renderForm(definition(googleFormsTheme));
    expect(container.querySelector("[data-chrome='google']")).not.toBeNull();
    expect(container.querySelectorAll(".form-title-card")).toHaveLength(1);
    expect(container.querySelector(".form-title-card")).toHaveTextContent("Team lunch");
    expect(container.querySelectorAll(".form-q-card")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear form" })).toBeInTheDocument();
  });

  it("puts the chrome class on the theme wrapper", () => {
    expect(themeClass(definition(googleFormsTheme))).toContain("form-chrome-google");
    expect(themeClass(definition(googleFormsTheme))).toContain("form-font-roboto");
    expect(themeClass(definition(microsoftFormsTheme))).toContain("form-chrome-microsoft");
  });

  it("clears every answer after confirming", () => {
    const onAnswer = vi.fn();
    renderForm(definition(googleFormsTheme), { name: "Sam", day: "a" }, onAnswer);
    fireEvent.click(screen.getByRole("button", { name: "Clear form" }));
    expect(onAnswer).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear form" }));
    expect(onAnswer).toHaveBeenCalledWith("name", undefined);
    expect(onAnswer).toHaveBeenCalledWith("day", undefined);
    expect(onAnswer).toHaveBeenCalledTimes(2);
  });
});

describe("microsoft-forms chrome", () => {
  it("renders a banner header above one column and marks answerable questions for numbering", () => {
    const { container } = renderForm(definition(microsoftFormsTheme));
    expect(container.querySelector("[data-chrome='microsoft'] > .form-layout-flat > .form-title-card")).toHaveTextContent("Team lunch");
    expect(container.querySelector("form.form-column")).not.toBeNull();
    expect(container.querySelectorAll(".form-q-card[data-answerable]")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Clear form" })).toBeNull();
  });
});

describe("themes without chrome", () => {
  it("render exactly as before: no title card, no data-chrome, no clear button", () => {
    const { container } = renderForm(definition({ ...paperTheme, cover: "none" }));
    expect(container.querySelector("[data-chrome]")).toBeNull();
    expect(container.querySelector(".form-title-card")).toBeNull();
    expect(container.querySelector("h1")).toHaveTextContent("Team lunch");
    expect(screen.queryByRole("button", { name: "Clear form" })).toBeNull();
    expect(themeClass(definition(paperTheme))).not.toContain("form-chrome");
  });
});
