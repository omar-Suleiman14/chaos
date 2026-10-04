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
