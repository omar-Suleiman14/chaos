import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Select } from "@/components/workspace/Select";
import { WsDialog } from "@/components/workspace/primitives";

const fruit = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot" },
  { value: "banana", label: "Banana", disabled: true },
  { value: "cherry", label: "Cherry" },
  { value: "date", label: "Date", description: "Sweet and sticky" },
];

function Example({ onChange = () => {}, initial = "apple" }: { onChange?: (v: string) => void; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="workspace-ui">
      <Select label="Fruit" value={value} options={fruit} onChange={(v) => { setValue(v); onChange(v); }} />
      <button type="button">After</button>
    </div>
  );
}

const combobox = () => screen.getByRole("combobox", { name: "Fruit" });
const activeOption = () => {
  const id = combobox().getAttribute("aria-activedescendant");
  return id ? document.getElementById(id) : null;
};

describe("workspace Select", () => {
  it("is a named combobox that shows the chosen label and opens a listbox", async () => {
    const user = userEvent.setup();
    render(<Example />);
    expect(combobox()).toHaveTextContent("Apple");
    expect(combobox()).toHaveAttribute("aria-expanded", "false");
    await user.click(combobox());
    expect(combobox()).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("listbox", { name: "Fruit" });
    expect(combobox()).toHaveAttribute("aria-controls", list.id);
    expect(screen.getAllByRole("option")).toHaveLength(5);
    expect(screen.getByRole("option", { name: /Apple/ })).toHaveAttribute("aria-selected", "true");
    // Focus never leaves the button; the highlighted option is announced by id.
    expect(combobox()).toHaveFocus();
    expect(activeOption()).toHaveTextContent("Apple");
  });

  it("moves with arrows, skips disabled options, and chooses with Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Example onChange={onChange} />);
    combobox().focus();
    await user.keyboard("{ArrowDown}");
    expect(activeOption()).toHaveTextContent("Apple");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(activeOption()).toHaveTextContent("Cherry");
    await user.keyboard("{ArrowUp}");
    expect(activeOption()).toHaveTextContent("Apricot");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("apricot");
    expect(combobox()).toHaveAttribute("aria-expanded", "false");
    expect(combobox()).toHaveTextContent("Apricot");
    expect(combobox()).toHaveFocus();
  });

  it("supports Home, End and Space", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Example onChange={onChange} />);
    combobox().focus();
    await user.keyboard("{End}");
    expect(combobox()).toHaveAttribute("aria-expanded", "true");
    expect(activeOption()).toHaveTextContent("Date");
    await user.keyboard("{Home}");
    expect(activeOption()).toHaveTextContent("Apple");
    await user.keyboard("{End}[Space]");
    expect(onChange).toHaveBeenCalledWith("date");
  });

  it("closes on Escape without changing the value, and Escape does not close a surrounding dialog", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<div className="workspace-ui"><WsDialog title="Settings" onClose={onClose}><Example onChange={onChange} /></WsDialog></div>);
    combobox().focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Escape}");
    expect(combobox()).toHaveAttribute("aria-expanded", "false");
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // The list opened inside the dialog, so it is not made inert.
    await user.click(combobox());
    expect(screen.getByRole("dialog").contains(screen.getByRole("listbox"))).toBe(true);
  });

  it("jumps by typing, cycling through options with the same first letter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Example onChange={onChange} initial="cherry" />);
    combobox().focus();
    await user.keyboard("a");
    expect(combobox()).toHaveAttribute("aria-expanded", "true");
    expect(activeOption()).toHaveTextContent("Apple");
    await user.keyboard("a");
    expect(activeOption()).toHaveTextContent("Apricot");
    // Letters typed together spell a prefix; after a pause a new search starts.
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5000);
    await user.keyboard("d{Enter}");
    now.mockRestore();
    expect(onChange).toHaveBeenLastCalledWith("date");
  });

  it("chooses with the pointer, ignores disabled options, and closes on a click outside", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Example onChange={onChange} />);
    await user.click(combobox());
    await user.click(screen.getByRole("option", { name: /Banana/ }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("option", { name: /Cherry/ }));
    expect(onChange).toHaveBeenCalledWith("cherry");
    await user.click(combobox());
    fireEvent.pointerDown(screen.getByRole("button", { name: "After" }));
    expect(combobox()).toHaveAttribute("aria-expanded", "false");
  });

  it("Tab chooses the highlighted option and closes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Example onChange={onChange} />);
    combobox().focus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await user.tab();
    expect(onChange).toHaveBeenCalledWith("apricot");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("takes its name from a wrapping label", () => {
    render(<label>Language <Select value="en" onChange={() => {}} options={[{ value: "en", label: "English" }, { value: "ar", label: "العربية" }]} /></label>);
    expect(screen.getByRole("combobox", { name: /Language/ })).toHaveTextContent("English");
  });
});
