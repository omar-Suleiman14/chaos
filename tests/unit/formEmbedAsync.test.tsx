import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import EmbedPanel from "@/components/forms/builder/EmbedPanel";
import type { Id } from "@/convex/_generated/dataModel";

const save = vi.hoisted(() => vi.fn());
vi.mock("convex/react", () => ({
  useMutation: () => save,
  useQuery: () => ({ enabled: true, anyOrigin: false, origins: ["https://example.com"], canEdit: true, blockedBy: "unpublished" }),
}));
it("preserves allowed-site edits made while saving", async () => {
  let finish!: (value: { origins: string[] }) => void;
  save.mockImplementation(() => new Promise<{ origins: string[] }>((resolve) => { finish = resolve; }));
  render(<EmbedPanel formId={"f1" as Id<"forms">} link="https://chaos.fail/f/a" title="Example" />);
  const sites = screen.getByDisplayValue("https://example.com");
  fireEvent.change(sites, { target: { value: "https://first.example" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  fireEvent.change(sites, { target: { value: "https://second.example" } });
  await act(async () => finish({ origins: ["https://first.example"] }));
  expect(sites).toHaveValue("https://second.example");
});
