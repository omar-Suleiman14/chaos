import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DesignTab from "@/components/forms/builder/DesignTab";
import { emptyDefinition } from "@/convex/formLogic";

vi.mock("convex/react", () => ({ useQuery: () => [], useMutation: () => vi.fn() }));
vi.mock("@/components/workspace/useIsPhone", () => ({ useIsPhone: () => true }));
vi.mock("@/components/forms/builder/FormPreview", () => ({
  PreviewSurface: () => <div data-testid="respondent-preview" />,
}));
vi.mock("@/lib/sfx", () => ({ sfx: { play: vi.fn() } }));

describe("design preview on phones", () => {
  it("shows the inline preview without opening full screen and retains the full-screen action", () => {
    const onFullPreview = vi.fn();
    render(<DesignTab def={emptyDefinition("Example")} change={vi.fn()} readOnly={false} onFullPreview={onFullPreview} />);
    expect(screen.getByRole("region", { name: "Preview" })).toContainElement(screen.getByTestId("respondent-preview"));
    expect(onFullPreview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Full-screen preview" }));
    expect(onFullPreview).toHaveBeenCalledOnce();
  });
});
