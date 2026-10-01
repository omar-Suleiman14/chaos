import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import HandoffDialog from "@/components/learn/reader/HandoffDialog";

describe("external handoff keyboard controls", () => {
  it("moves the selected action with arrows and keeps a single tab stop", () => {
    render(<LocaleProvider initial="en"><HandoffDialog input={{ lessonTitle: "Liver", selection: "Portal pressure" }} onClose={() => {}} /></LocaleProvider>);
    const group = screen.getByRole("radiogroup", { name: "What to ask" });
    const choices = within(group).getAllByRole("radio");
    choices[0].focus();
    fireEvent.keyDown(choices[0], { key: "ArrowRight" });
    expect(choices[1]).toHaveFocus();
    expect(choices[1]).toHaveAttribute("aria-checked", "true");
    expect(choices.filter(choice => choice.tabIndex === 0)).toEqual([choices[1]]);
    expect(screen.getByRole("dialog").querySelector("pre")).toHaveTextContent("simpler words");
    fireEvent.keyDown(choices[1], { key: "End" });
    expect(choices.at(-1)).toHaveFocus();
    fireEvent.keyDown(choices.at(-1)!, { key: "Home" });
    expect(choices[0]).toHaveFocus();
  });
});
