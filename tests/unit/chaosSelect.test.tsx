import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ChaosSelect } from "@/components/workspace/ChaosSelect";

it("uses the Chaos listbox and submits the selected value, with reset support", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  const { container } = render(<form><label>Team<ChaosSelect name="team" required onChange={change}><option value="">Choose a team</option><option value="alpha">Alpha</option><option value="beta" disabled>Beta</option></ChaosSelect></label></form>);
  const form = container.querySelector("form")!;
  const trigger = screen.getByRole("combobox", { name: /Team/ });
  expect(container.querySelector("select")).toBeNull();
  act(() => { expect(form.checkValidity()).toBe(false); });
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-invalid", "true");
  await user.click(trigger);
  await user.click(screen.getByRole("option", { name: "Beta" }));
  expect(change).not.toHaveBeenCalled();
  await user.click(screen.getByRole("option", { name: "Alpha" }));
  expect(change).toHaveBeenCalledWith({ target: { value: "alpha" }, currentTarget: { value: "alpha" } });
  expect(new FormData(form).get("team")).toBe("alpha");
  expect(form.checkValidity()).toBe(true);
  fireEvent.reset(form);
  expect(new FormData(form).get("team")).toBe("");
});

it("keeps controlled numeric values, linked labels, and disabled form behavior", () => {
  const { container, rerender } = render(<form><label htmlFor="version">Version</label><ChaosSelect id="version" name="version" value={2} disabled><option value={1}>One</option><option value={2}>Two</option></ChaosSelect></form>);
  expect(screen.getByRole("combobox", { name: "Version" })).toHaveTextContent("Two");
  expect(screen.getByRole("combobox")).toBeDisabled();
  expect(new FormData(container.querySelector("form")!).has("version")).toBe(false);
  rerender(<form><ChaosSelect aria-label="Version" name="version" value={1}><option value={1}>One</option><option value={2}>Two</option></ChaosSelect></form>);
  expect(screen.getByRole("combobox")).toHaveTextContent("One");
  expect(new FormData(container.querySelector("form")!).get("version")).toBe("1");
});
