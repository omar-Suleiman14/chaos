import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminSettings from "@/components/AdminSettings";

const updateGlobalConfig = vi.fn().mockResolvedValue(undefined);

vi.mock("convex/react", () => ({
  useMutation: () => updateGlobalConfig,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { quizFunctions: { updateGlobalConfig: "quizFunctions:updateGlobalConfig" } },
}));

describe("AdminSettings", () => {
  it("saves the toggled 'show correct answers' state and shows confirmation", async () => {
    const user = userEvent.setup();
    render(<AdminSettings globalConfig={null} />);

    const toggle = screen.getByLabelText(/show correct answers/i);
    expect(toggle).toBeChecked();

    await user.click(toggle);
    expect(toggle).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: /save settings/i }));

    expect(updateGlobalConfig).toHaveBeenCalledTimes(1);
    expect(updateGlobalConfig).toHaveBeenCalledWith(
      expect.objectContaining({ showCorrectAnswers: false, showExplanations: true })
    );
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });

  it("hydrates its fields from an existing global config", () => {
    render(
      <AdminSettings
        globalConfig={{
          showCorrectAnswers: false,
          displayMode: "pass_fail",
          passingThreshold: 70,
        }}
      />
    );

    expect(screen.getByLabelText(/show correct answers/i)).not.toBeChecked();
    expect(screen.getByText("70%")).toBeInTheDocument();
  });
});
