import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ChangePreview from "@/components/connections/ChangePreview";
import type { LessonMeta } from "@/lib/learn/types";

const meta = (title: string): LessonMeta => ({ title, description: "", tags: [], language: "en", curricula: [], indexing: "noindex" });

describe("ChangePreview", () => {
  it("shows detail and block changes and calls the chosen action", () => {
    const keep = vi.fn();
    const take = vi.fn();
    render(
      <ChangePreview appName="Max" before={meta("Portal Hypertension")} after={meta("Portal HTN")}
        changes={[{ blockId: "b1", kind: "changed", beforeText: "Old line", afterText: "New line" }, { blockId: "b2", kind: "added", afterText: "Extra" }]}
        onKeepMine={keep} onTakeTheirs={take} />,
    );
    expect(screen.getByRole("heading", { name: "Changes from Max" })).toBeInTheDocument();
    expect(screen.getByText("1 block added · 1 block changed")).toBeInTheDocument();
    expect(screen.getByText("Old line")).toBeInTheDocument();
    expect(screen.getByText("Portal HTN")).toBeInTheDocument();
    // No merge callback, no merge button.
    expect(screen.queryByRole("button", { name: /side by side/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep my version" }));
    expect(take).toHaveBeenCalledOnce();
    expect(keep).toHaveBeenCalledOnce();
  });

  it("uses conflict wording and a neutral app name", () => {
    const merge = vi.fn();
    render(<ChangePreview mode="conflict" before={meta("A")} after={meta("A")} changes={[]} onMerge={merge} onTakeTheirs={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("You and the connected app both changed this lesson.");
    expect(screen.getByText("No differences.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Merge by hand" }));
    expect(merge).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Load their version" })).toBeInTheDocument();
  });
});
