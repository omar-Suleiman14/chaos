import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import HistoryTab from "@/components/forms/builder/HistoryTab";
import { emptyDefinition } from "@/convex/formLogic";
import type { Id } from "@/convex/_generated/dataModel";

const restore = vi.hoisted(() => vi.fn());
vi.mock("convex/react", () => ({
  useMutation: () => restore,
  useQuery: () => ({ version: 1, definition: emptyDefinition("Published") }),
}));
beforeEach(() => { restore.mockReset(); });
function example(beforeRestore: () => Promise<boolean>) {
  return <HistoryTab formId={"f1" as Id<"forms">} versions={[{ version: 1, publishedAt: Date.now(), publishedByName: "Owner" }]} canEdit revision={() => 4} beforeRestore={beforeRestore} />;
}
it("stops restoration when saving pending edits fails", async () => {
  render(example(vi.fn().mockResolvedValue(false)));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy into draft" })));
  expect(restore).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("Save your pending changes");
});
it("waits for saving and prevents repeated restores", async () => {
  let resolve!: (value: boolean) => void;
  const save = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
  restore.mockResolvedValue(5);
  render(example(save));
  const button = screen.getByRole("button", { name: "Copy into draft" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(save).toHaveBeenCalledTimes(1);
  expect(restore).not.toHaveBeenCalled();
  await act(async () => resolve(true));
  expect(restore).toHaveBeenCalledExactlyOnceWith({ formId: "f1", version: 1, expectedRevision: 4 });
  expect(button).toBeEnabled();
});
