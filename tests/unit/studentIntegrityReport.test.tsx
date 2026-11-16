import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { StudentIntegrityReport } from "../../components/exams/StudentIntegrityReport";

const mocks = vi.hoisted(() => ({ explain: vi.fn() }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "examIntegrity:getMine"
      ? [{ eventId: "event-123", kind: "blur", decision: "warning", observedAt: 1000 }] : [],
    useMutation: () => mocks.explain,
  };
});

it("lets the candidate explain a recorded event", async () => {
  mocks.explain.mockResolvedValue({ revision: 1 });
  render(<StudentIntegrityReport attemptId={"attempt" as Id<"examAttempts">} locale="en" />);
  fireEvent.click(screen.getByRole("button", { name: /blur/ }));
  fireEvent.change(screen.getByLabelText("Explanation (10–500 characters)"),
    { target: { value: "The connection dropped briefly." } });
  fireEvent.click(screen.getByRole("button", { name: "Send explanation" }));
  await waitFor(() => expect(mocks.explain).toHaveBeenCalledWith({ attemptId: "attempt", eventId: "event-123",
    expectedRevision: 0, explanation: "The connection dropped briefly." }));
  expect(await screen.findByText("Explanation sent.")).toBeInTheDocument();
});
