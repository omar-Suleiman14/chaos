import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import HistoryTab from "@/components/forms/builder/HistoryTab";
import { emptyDefinition } from "@/convex/formLogic";
import type { Id } from "@/convex/_generated/dataModel";

it("mounts History and opens versions using the real Convex subscription hooks", () => {
  // Only the transport is stubbed: useQueries/useMutation and their subscription lifecycle are real.
  const watchQuery = vi.fn((_query: unknown, args: { version: number }) => ({
    localQueryResult: () => ({ definition: emptyDefinition(`Published ${args.version}`) }),
    onUpdate: () => () => {},
    journal: () => undefined,
  }));
  const client = { watchQuery, mutation: vi.fn() } as unknown as ConvexReactClient;
  render(<ConvexProvider client={client}><HistoryTab formId={"f1" as Id<"forms">} versions={[{version: 1, publishedAt: Date.now(), publishedByName: "Owner"}]} canEdit revision={() => 4} beforeRestore={vi.fn().mockResolvedValue(true)} /></ConvexProvider>);
  expect(screen.getByRole("button", {name: "Browse versions"})).toBeInTheDocument();
  expect(watchQuery).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name: "Browse versions"}));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Copy into draft"})).toBeInTheDocument();
  expect(watchQuery).toHaveBeenCalled();
});
