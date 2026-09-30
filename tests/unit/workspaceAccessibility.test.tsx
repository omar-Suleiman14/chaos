import { StrictMode, useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WsDialog, WsMenu } from "@/components/workspace/primitives";
import CommandPalette from "@/components/workspace/CommandPalette";
import DashboardLayout from "@/app/dashboard/layout";
import { useModal } from "@/components/workspace/useModal";

const mocks = vi.hoisted(() => ({ push: vi.fn(), toggleTheme: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }), usePathname: () => "/dashboard" }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ toggleTheme: mocks.toggleTheme }) }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isLoaded: false }), useClerk: () => ({ signOut: async () => {} }), UserButton: () => null }));
vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => vi.fn() }));
vi.mock("@/components/workspace/useCreateForm", () => ({ useCreateForm: () => ({ create: vi.fn(), busy: false }) }));
vi.mock("@/components/NotificationBell", () => ({ default: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

function DialogExample() {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  return <div className="workspace-ui">
    <button onClick={() => setOpen(true)}>Open dialog</button>
    <button>Background</button>
    {open && <WsDialog title="First" description="Details" onClose={() => setOpen(false)}>
      <input aria-label="Name" />
      <button onClick={() => setNested(true)}>Nested</button>
      {nested && <WsDialog title="Second" onClose={() => setNested(false)}><button>Inner</button></WsDialog>}
    </WsDialog>}
  </div>;
}

describe("workspace modals", () => {
  it("traps focus, isolates background, closes on Escape and restores focus and scroll", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "clip";
    render(<DialogExample />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "First" });
    expect(dialog).toHaveAccessibleDescription("Details");
    expect(trigger).toHaveAttribute("inert");
    expect(trigger).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Nested" })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
    trigger.focus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).not.toHaveAttribute("inert");
    expect(trigger).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("clip");
    document.body.style.overflow = "";
  });

  it("dismisses only the top layer and returns focus within the underlying modal", async () => {
    const user = userEvent.setup();
    render(<DialogExample />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await user.click(screen.getByRole("button", { name: "Nested" }));
    expect(screen.getByRole("dialog", { name: "Second" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Second" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nested" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Open dialog" })).toHaveFocus();
  });

  it("restores focus to the trigger under StrictMode's effect remount", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DialogExample /></StrictMode>);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Nested" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Nested" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("focuses an empty dialog and keeps Tab inside it", () => {
    function Empty() {
      const ref = useModal({ onClose: vi.fn() });
      return <div ref={ref} tabIndex={-1} role="dialog" aria-label="Empty" aria-modal="true" />;
    }
    render(<Empty />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(dialog).toHaveFocus();
  });
});

describe("workspace menu", () => {
  it("escapes card clipping and supports arrows, Home/End, typeahead and return focus", async () => {
    const user = userEvent.setup();
    render(<div className="workspace-ui"><div data-testid="card" style={{ overflow: "hidden" }}>
      <WsMenu label="Actions">{(close) => <>
        <button role="menuitem" disabled>Unavailable</button>
        <button role="menuitem" onClick={close}>Archive</button>
        <button role="menuitem" onClick={close}>Duplicate</button>
        <button role="menuitem" onClick={close}>Delete</button>
      </>}</WsMenu>
    </div></div>);
    const trigger = screen.getByRole("button", { name: "Actions" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
    expect(screen.getByTestId("card")).not.toContainElement(screen.getByRole("menu"));
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
    await user.keyboard("del");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveFocus();
  });
});

describe("command palette", () => {
  function Palette() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Search workspace</button>
      <CommandPalette open={open} onClose={() => setOpen(false)} onNew={vi.fn()}
        items={[{ id: "form", title: "Example", kind: "form", href: "/example" }]} /></>;
  }

  it("navigates in rendered order with an active descendant and executes the selected item", async () => {
    const user = userEvent.setup();
    render(<Palette />);
    await user.click(screen.getByRole("button", { name: "Search workspace" }));
    const input = screen.getByRole("combobox");
    const options = screen.getAllByRole("option");
    expect(input).toHaveFocus();
    for (let index = 0; index < options.length; index++) {
      expect(input).toHaveAttribute("aria-activedescendant", options[index].id);
      expect(options[index]).toHaveAttribute("aria-selected", "true");
      expect(options[index]).toHaveAttribute("tabindex", "-1");
      if (index < options.length - 1) await user.keyboard("{ArrowDown}");
    }
    await user.tab();
    expect(input).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(mocks.push).toHaveBeenCalledWith("/example");
    expect(screen.getByRole("button", { name: "Search workspace" })).toHaveFocus();
  });

  it("clears the active descendant for no matches and recovers after filtering", async () => {
    const user = userEvent.setup();
    render(<Palette />);
    await user.click(screen.getByRole("button", { name: "Search workspace" }));
    const input = screen.getByRole("combobox");
    await user.type(input, "no matching item");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(mocks.push).not.toHaveBeenCalled();
    await user.clear(input);
    expect(input).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0].id);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Search workspace" })).toHaveFocus();
  });
});

describe("mobile workspace navigation", () => {
  it("makes the closed sidebar inert, traps the open drawer, and supports Escape and close", async () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn(() => ({
      matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })) });
    const user = userEvent.setup();
    render(<DashboardLayout><button>Page action</button></DashboardLayout>);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    const sidebar = document.getElementById("workspace-navigation")!;
    expect(sidebar).toHaveAttribute("inert");
    expect(sidebar).toHaveAttribute("aria-hidden", "true");
    await user.click(trigger);
    expect(sidebar).not.toHaveAttribute("inert");
    expect(screen.getByRole("dialog", { name: "Workspace" })).toBe(sidebar);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(sidebar).toHaveAttribute("inert");
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Close menu" }));
    expect(trigger).toHaveFocus();
    expect(sidebar).toHaveAttribute("inert");
  });
});

describe("desktop sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn(() => ({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })) });
  });

  it("hides entirely with Ctrl+B, comes back from the top bar, and remembers it", async () => {
    const user = userEvent.setup();
    render(<DashboardLayout><input aria-label="Title" /></DashboardLayout>);
    const sidebar = document.getElementById("workspace-navigation")!;
    expect(sidebar).toHaveAttribute("data-collapsed", "false");
    fireEvent.keyDown(document.body, { key: "b", ctrlKey: true });
    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(sidebar).toHaveAttribute("inert");
    expect(localStorage.getItem("chaos.ui.sidebar-collapsed")).toBe("true");
    // Typing in a field keeps Ctrl+B for the field.
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Title" }), { key: "b", ctrlKey: true });
    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    await user.click(screen.getByRole("button", { name: "Show sidebar" }));
    expect(sidebar).toHaveAttribute("data-collapsed", "false");
  });

  it("resizes with the keyboard within limits and resets on double-click", () => {
    render(<DashboardLayout><p>Page</p></DashboardLayout>);
    const handle = screen.getByRole("separator", { name: "Resize sidebar" });
    const sidebar = document.getElementById("workspace-navigation")!;
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(sidebar.style.width).toBe("272px");
    for (let i = 0; i < 20; i++) fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(sidebar.style.width).toBe("420px");
    expect(localStorage.getItem("chaos.ui.sidebar-width")).toBe("420");
    fireEvent.doubleClick(handle);
    expect(sidebar.style.width).toBe("256px");
  });
});
