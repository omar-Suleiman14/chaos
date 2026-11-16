import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { defaultExamSettings } from "../../convex/examSettingsModel";
import { ExamReleaseSettings } from "../../components/courses/ExamReleaseSettings";

const mocks = vi.hoisted(() => ({ info: null as unknown, save: vi.fn(), other: vi.fn() }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return { useQuery: () => mocks.info, useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "examSettings:saveForDraft" ? mocks.save : mocks.other };
});
vi.mock("@/lib/i18n", () => ({ useLocale: () => ({ locale: "en" }) }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  mocks.info = { snapshotId: "snapshot", snapshotVersion: 1, snapshotDraftRevision: 1,
    revision: 1, settings: { ...defaultExamSettings }, preparedForAudience: false, studentEntryEnabled: false };
  mocks.save.mockReset().mockResolvedValue(3);
});

it("preserves unsaved edits and their original revision across remote changes", async () => {
  const { rerender } = render(<ExamReleaseSettings draftId={"draft" as Id<"examBuilderDrafts">} draftRevision={1} canSeal />);
  const duration = screen.getByLabelText("Time limit (minutes)");
  await waitFor(() => expect(duration).toBeEnabled());
  fireEvent.change(duration, { target: { value: "75" } });
  mocks.info = { ...(mocks.info as object), revision: 2,
    settings: { ...defaultExamSettings, durationMinutes: 90 } };
  rerender(<ExamReleaseSettings draftId={"draft" as Id<"examBuilderDrafts">} draftRevision={1} canSeal />);
  expect(duration).toHaveValue(75);
  expect(screen.getByRole("alert")).toHaveTextContent("Settings changed elsewhere");
  expect(screen.getByRole("button", { name: "Save exam settings" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Load latest settings" }));
  expect(duration).toHaveValue(90);
  fireEvent.change(duration, { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Save exam settings" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
    expectedRevision: 2, settings: expect.objectContaining({ durationMinutes: 100 }),
  })));
});
