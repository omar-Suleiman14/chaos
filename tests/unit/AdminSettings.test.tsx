import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => updateGlobalConfig.mockReset().mockResolvedValue(undefined));

  it("shows save failures and allows retrying without losing edited settings", async () => {
    updateGlobalConfig.mockRejectedValueOnce(new Error("Settings service unavailable"));
    const user = userEvent.setup();
    render(<AdminSettings globalConfig={null} />);
    await user.click(screen.getByLabelText(/show correct answers/i));
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Settings service unavailable");
    expect(screen.getByRole("button", { name: /save settings/i })).toBeEnabled();
    expect(screen.getByLabelText(/show correct answers/i)).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    expect(await screen.findByText(/^Saved$/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(updateGlobalConfig).toHaveBeenLastCalledWith(expect.objectContaining({ showCorrectAnswers: false }));
  });
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
