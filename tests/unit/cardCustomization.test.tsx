import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import CardCustomization, { CardOnboarding } from "@/components/card/CardCustomization";

const state = vi.hoisted(() => ({ query: undefined as unknown, save: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: () => state.query, useMutation: () => state.save }));
vi.mock("@/lib/i18n", () => ({ useLocale: () => ({ locale: "en" }), useCopy: (copy: { en: unknown }) => copy.en }));
vi.mock("@/components/card/MemberCardView", () => ({ default: () => <div>Card preview</div> }));
vi.mock("@/components/MemberAvatar", () => ({ default: () => <span /> }));
const card = { name: "Student", username: "student", seed: "seed", style: 0, memberSince: 1 };
beforeEach(() => { state.query = undefined; state.save.mockReset().mockResolvedValue(undefined); });

it("shows a layout skeleton without visible loading text while onboarding loads", () => {
  const view = render(<CardOnboarding actorId="student" onDone={vi.fn()} />);
  expect(view.container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  expect(view.container.textContent).toBe("");
});

it("preserves an existing opt-out and saves changes from the accessible switch", async () => {
  state.query = { hideStudentCards: true };
  const view = render(<CardCustomization card={card} actorId="student" onboarding onDone={vi.fn()} />);
  const toggle = view.getByRole("switch", { name: "Show my Card with my teachers" });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  expect(toggle).toBeChecked();
  fireEvent.click(view.getByRole("button", { name: "Skip for now" }));
  await waitFor(() => expect(state.save).toHaveBeenCalledWith({ skip: true, showStudentCards: true }));
});

it("does not submit the app-generated username again when saving other card changes", async () => {
  state.query = {};
  const view = render(<CardCustomization card={{ ...card, username: "user98049" }} actorId="student" />);
  fireEvent.click(view.getByRole("button", { name: "Save my Card" }));
  await waitFor(() => expect(state.save).toHaveBeenCalled());
  expect(state.save.mock.calls[0][0]).not.toHaveProperty("username");
});

it("shows a field message without Convex internals when a new username is rejected", async () => {
  state.query = {};
  state.save.mockRejectedValue(new Error("[CONVEX M(memberCards:customizeCard)] [Request ID: abc] Server Error\nUncaught Error: INVALID_USERNAME: That username is reserved. Try another. Called by client"));
  const view = render(<CardCustomization card={card} actorId="student" />);
  fireEvent.change(view.getByRole("textbox", { name: "Username" }), { target: { value: "admin" } });
  fireEvent.click(view.getByRole("button", { name: "Save my Card" }));
  expect(await view.findByRole("alert")).toHaveTextContent("That username is reserved. Try another.");
  expect(view.getByRole("alert").textContent).not.toMatch(/CONVEX|Request ID|Called by client|INVALID_USERNAME/);
  expect(view.getByRole("textbox", { name: "Username" })).toHaveAttribute("aria-invalid", "true");
});
