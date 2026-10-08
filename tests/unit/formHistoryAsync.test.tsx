import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import HistoryTab from "@/components/forms/builder/HistoryTab";
import { emptyDefinition } from "@/convex/formLogic";
import type { Id } from "@/convex/_generated/dataModel";

const restore = vi.hoisted(() => vi.fn());
const history = vi.hoisted(() => ({ pending: false }));
vi.mock("convex/react", () => ({
  useMutation: () => restore,
  useQueries: (queries: Record<string, unknown>) => Object.fromEntries(Object.keys(queries).map((k) => [k, history.pending ? undefined : { version: Number(k), definition: emptyDefinition(`Published ${k}`) }])),
}));
beforeEach(() => { restore.mockReset(); history.pending = false; });
function example(beforeRestore: () => Promise<boolean>) {
  render(<HistoryTab formId={"f1" as Id<"forms">} versions={[{ version: 1, publishedAt: Date.now(), publishedByName: "Owner" }]} canEdit revision={() => 4} beforeRestore={beforeRestore} />);
  fireEvent.click(screen.getByRole("button", { name: "Browse versions" }));
  // The first click asks for confirmation; the second copies the version into the draft.
  fireEvent.click(screen.getByRole("button", { name: "Copy into draft" }));
  return screen.getByRole("button", { name: "Copy into draft" });
}
it("stops restoration when saving pending edits fails", async () => {
  const button = example(vi.fn().mockResolvedValue(false));
  await act(async () => fireEvent.click(button));
  expect(restore).not.toHaveBeenCalled();
  expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent("Save your pending changes");
});
it("waits for saving and prevents repeated restores", async () => {
  let resolve!: (value: boolean) => void;
  const save = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
  restore.mockResolvedValue(5);
  const button = example(save);
  fireEvent.click(button);
  fireEvent.click(screen.getByRole("button", { name: "Restoring…" }));
  expect(screen.getByRole("button", { name: "Restoring…" })).toBeDisabled();
  expect(save).toHaveBeenCalledTimes(1);
  expect(restore).not.toHaveBeenCalled();
  await act(async () => resolve(true));
  expect(restore).toHaveBeenCalledExactlyOnceWith({ formId: "f1", version: 1, expectedRevision: 4 });
  expect(screen.getByRole("button", { name: "Copy into draft" })).toBeEnabled();
});

it("opens the selected older version after its queries finish loading", async () => {
  history.pending = true;
  const props = { formId: "f1" as Id<"forms">, versions: [3, 2, 1].map(version => ({ version, publishedAt: Date.now(), publishedByName: "Owner" })), canEdit: true, revision: () => 4, beforeRestore: vi.fn().mockResolvedValue(true) };
  const view = render(<HistoryTab {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /Version 1/ }));
  expect(screen.getByText("Loading versions…")).toBeInTheDocument();
  history.pending = false;
  view.rerender(<HistoryTab {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy into draft" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy into draft" })));
  expect(restore).toHaveBeenCalledExactlyOnceWith({ formId: "f1", version: 1, expectedRevision: 4 });
});
it("can restore a timeline version older than the first thirty", async () => {
  const props = { formId: "f1" as Id<"forms">, versions: Array.from({ length: 35 }, (_, i) => ({ version: 35 - i, publishedAt: Date.now(), publishedByName: "Owner" })), canEdit: true, revision: () => 4, beforeRestore: vi.fn().mockResolvedValue(true) };
  render(<HistoryTab {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /^Version 1Owner/ }));
  fireEvent.click(screen.getByRole("button", { name: "Copy into draft" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy into draft" })));
  expect(restore).toHaveBeenCalledExactlyOnceWith({ formId: "f1", version: 1, expectedRevision: 4 });
});

it("copies the live version when its timeline entry is selected", async () => {
  render(<HistoryTab formId={"f1" as Id<"forms">} versions={[2, 1].map(version => ({ version, publishedAt: Date.now(), publishedByName: "Owner" }))} canEdit revision={() => 4} beforeRestore={vi.fn().mockResolvedValue(true)} />);
  fireEvent.click(screen.getByRole("button", { name: /Version 2/ }));
  fireEvent.click(screen.getByRole("button", { name: "Copy into draft" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy into draft" })));
  expect(restore).toHaveBeenCalledExactlyOnceWith({ formId: "f1", version: 2, expectedRevision: 4 });
});
