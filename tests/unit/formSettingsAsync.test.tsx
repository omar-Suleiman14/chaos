import type { ComponentProps } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import SettingsTab from "@/components/forms/builder/SettingsTab";
import { defaultFormSettings } from "@/convex/formModel";
import { emptyDefinition } from "@/convex/formLogic";
import type { Id } from "@/convex/_generated/dataModel";

const mutation = vi.hoisted(() => vi.fn());
vi.mock("convex/react", () => ({ useMutation: () => mutation, useQuery: () => undefined }));
vi.mock("@/lib/optimistic", () => ({ useOptimisticMutation: () => vi.fn(), setFormStatusLocally: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ default: { capture: vi.fn() } }));
const props: ComponentProps<typeof SettingsTab> = {
  formId: "f1" as Id<"forms">, settings: defaultFormSettings,
  hasAccessCode: false, status: "draft", published: false, def: emptyDefinition("Example"),
  isOwner: true, slug: null, shareId: "a",
};
beforeEach(() => { mutation.mockReset(); });

it("adopts remote settings only when the local settings are clean", () => {
  const { rerender } = render(<SettingsTab {...props} />);
  const limit = screen.getByRole("spinbutton", { name: "Response limit" });
  rerender(<SettingsTab {...props} settings={{ ...defaultFormSettings, responseLimit: 10 }} />);
  expect(limit).toHaveValue(10);
  fireEvent.change(limit, { target: { value: "20" } });
  rerender(<SettingsTab {...props} settings={{ ...defaultFormSettings, responseLimit: 30 }} />);
  expect(limit).toHaveValue(20);
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(limit).toHaveValue(30);
});

it("preserves settings and code edited during an in-flight save", async () => {
  let finish!: () => void;
  mutation.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const initial = { ...props, settings: { ...defaultFormSettings, access: "code" as const } };
  const { rerender } = render(<SettingsTab {...initial} />);
  const code = screen.getByRole("textbox", { name: "Access code" });
  const limit = screen.getByRole("spinbutton", { name: "Response limit" });
  fireEvent.change(code, { target: { value: "first-code" } });
  fireEvent.change(limit, { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  fireEvent.change(code, { target: { value: "second-code" } });
  fireEvent.change(limit, { target: { value: "20" } });
  rerender(<SettingsTab {...initial} settings={{ ...initial.settings, responseLimit: 10 }} />);
  await act(async () => finish());
  expect(code).toHaveValue("second-code");
  expect(limit).toHaveValue(20);
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});
