import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { WsConfirm } from "@/components/workspace/primitives";

function Example({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="workspace-ui">
      <button onClick={() => setOpen(true)}>Delete</button>
      {open && <WsConfirm title="Delete 2 responses?" body="They are deleted permanently." confirmLabel="Delete" onClose={() => setOpen(false)} onConfirm={onConfirm} />}
    </div>
  );
}

describe("confirmation dialog", () => {
  it("names what will be deleted, has no axe violations, and closes on Escape with focus back on the trigger", async () => {
    const onConfirm = vi.fn();
    render(<Example onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "Delete" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Delete 2 responses?" });
    expect(dialog).toHaveAccessibleDescription("They are deleted permanently.");
    expect((await axe(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("runs the action only when the destructive button is pressed", () => {
    const onConfirm = vi.fn();
    render(<Example onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
