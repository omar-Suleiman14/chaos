import { expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudyLessonsPage from "@/app/[lang]/(app)/dashboard/learn/study/page";
const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  upload: vi.fn(),
  read: vi.fn(),
  saveSource: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => mocks.start,
  useQuery: () => undefined,
}));
vi.mock("@/lib/learn/mediaClient", () => ({
  SOURCE_FILE_ACCEPT: ".pdf",
  useLearnMediaClient: () => ({
    upload: mocks.upload,
    read: mocks.read,
    saveSource: mocks.saveSource,
  }),
}));
vi.mock("@/lib/i18n", () => ({ useLocale: () => ({ locale: "en" }) }));
it("explicitly uploads browser files, starts the shared job with a Chaos source ID and preserves private bytes", async () => {
  mocks.upload.mockResolvedValue("chaos-source:source-id");
  mocks.read.mockResolvedValue({
    id: "source-id",
    title: "lecture.pdf",
    origin: "lecture.pdf",
    nativeKind: "pdf",
    metadataVisibility: "private",
    contentVisibility: "private",
  });
  mocks.start.mockResolvedValue({ jobId: "job-id" });
  const user = userEvent.setup();
  render(<StudyLessonsPage />);
  await user.type(screen.getByLabelText("Lesson title"), "Lecture 8");
  const file = new File(["%PDF-1.7"], "lecture.pdf", {
    type: "application/pdf",
  });
  await user.upload(screen.getByLabelText("Educational material"), file);
  await user.click(screen.getByRole("checkbox"));
  const submit = screen.getByRole("button", { name: "Prepare lesson" });
  expect(submit).toBeEnabled();
  // jsdom does not model native file-input constraint validation after userEvent uploads.
  fireEvent.submit(submit.closest("form")!);
  await waitFor(() =>
    expect(mocks.start).toHaveBeenCalledWith({
      request: expect.objectContaining({
        title: "Lecture 8",
        sources: [{ sourceId: "source-id", label: "lecture.pdf" }],
      }),
    }),
  );
  expect(mocks.upload).toHaveBeenCalledWith(file, {
    title: "lecture.pdf",
    origin: "lecture.pdf",
  });
  expect(mocks.saveSource).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "source-id",
      metadataVisibility: "public",
      contentVisibility: "private",
    }),
  );
});
it("shows a plain message instead of the raw server error", async () => {
  mocks.upload.mockResolvedValue("chaos-source:source-id");
  mocks.start.mockRejectedValue(
    new Error(
      "[CONVEX M(studyLessons:build)] [Request ID: abc] Server Error\nUncaught Error: RATE_LIMITED: Too many requests. Try again in 30 seconds.\n    at handler (../convex/serverUtils.ts:38:13)",
    ),
  );
  const user = userEvent.setup();
  render(<StudyLessonsPage />);
  await user.type(screen.getByLabelText("Lesson title"), "Lecture 8");
  await user.upload(
    screen.getByLabelText("Educational material"),
    new File(["%PDF-1.7"], "lecture.pdf", { type: "application/pdf" }),
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "Prepare lesson" }).closest("form")!,
  );
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(
    "You've prepared a lot of material recently. Wait a little, then try again.",
  );
  expect(alert.textContent).not.toMatch(/CONVEX|Uncaught|handler/);
});
