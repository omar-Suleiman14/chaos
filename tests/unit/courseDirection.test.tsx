vi.mock("@/lib/learn/mediaClient", () => ({ useLearnMediaClient: () => ({ resolve: vi.fn(), upload: vi.fn() }) }));
import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";

const backend = vi.hoisted(() => ({ update: vi.fn(), course: { id: "course1", title: "دورة عربية", description: "مقدمة", language: "ar-EG", tags: [], lessons: [], published: false, visibility: "public" } }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: false }),
  useConvex: () => ({ query: vi.fn(), mutation: vi.fn() }), useQuery: () => backend.course, useMutation: () => backend.update }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ lang: "en" }) }));
vi.mock("@/components/learn/editor/PageHeader", () => ({ LessonCover: () => null, PageIconControls: () => null }));
vi.mock("@/components/courses/CourseStudents", () => ({ default: () => null }));
const { default: CourseBuilder } = await import("@/app/[lang]/(app)/dashboard/courses/[id]/page");
beforeEach(() => backend.update.mockReset().mockResolvedValue(null));
it("sets Arabic course fields RTL in an English interface and saves language changes", async () => {
  const params = Promise.resolve({ id: "course1" });
  await act(async () => { render(<LocaleProvider initial="en"><Suspense><CourseBuilder params={params} /></Suspense></LocaleProvider>); });
  const title = await screen.findByRole("textbox", { name: "Course title" });
  expect(title).toHaveValue("دورة عربية");
  expect(title).toHaveAttribute("dir", "rtl");
  expect(title).toHaveAttribute("lang", "ar-EG");
  expect(document.querySelector(".cb-page")).toHaveAttribute("dir", "ltr");
  fireEvent.click(screen.getByRole("combobox", { name: "Course language" }));
  fireEvent.click(await screen.findByRole("option", { name: "English" }));
  await waitFor(() => expect(backend.update).toHaveBeenCalledWith({ courseId: "course1", language: "en" }));
});
