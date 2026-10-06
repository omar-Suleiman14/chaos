import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";

/**
 * Lesson numbers restart in every module, everywhere a module is shown:
 * Anatomy 1, 2, 3; Physiology 1, 2; Histology 1, 2. Course-wide positions
 * (4, 5, 6, 7) must never leak into a module.
 */
const modules = [
  { id: "anatomy", title: "Anatomy", lessonIds: ["l1", "l2", "l3"], assessments: [] },
  { id: "physiology", title: "Physiology", lessonIds: ["l4", "l5"], assessments: [] },
  { id: "histology", title: "Histology", lessonIds: ["l6", "l7"], assessments: [] },
];
const titles = ["Meninges", "Ventricles", "Cranial nerves", "Action potentials", "Synapses", "Neurons", "Glia"];
const lessons = titles.map((title, i) => ({ id: `l${i + 1}`, versionId: `v${i + 1}`, title, description: "", blocks: 4, published: true, changed: false }));
const course = { id: "c1", title: "Central nervous system", description: "", language: "en", tags: [], modules, lessons, ownerName: "Perry", ownerUsername: "perry" };

vi.mock("convex/react", () => ({ useQuery: () => course, useMutation: () => vi.fn().mockResolvedValue(null), useConvexAuth: () => ({ isAuthenticated: false }) }));
vi.mock("@/lib/queryCache", () => ({ useKeptQuery: () => course }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/learn/courseProgress", () => ({ useCourseProgress: () => ({}) }));
vi.mock("@/lib/learn/courseEnrollment", () => ({ useCourseEnrollment: () => ({ state: { enrolled: true } }) }));
vi.mock("@/components/learn/reader/InlineQuiz", () => ({ default: () => null }));
vi.mock("@/components/learn/editor/QuizBlockEditor", () => ({ default: () => null }));

const { default: CourseOutline } = await import("@/components/courses/CourseOutline");
const { default: CourseModulesEditor } = await import("@/components/courses/CourseModulesEditor");
const { default: CourseBreadcrumb } = await import("@/components/learn/reader/CourseBreadcrumb");

const wrap = (ui: React.ReactNode) => render(<LocaleProvider initial="en">{ui}</LocaleProvider>);
const numbersIn = (section: HTMLElement, selector: string) => [...section.querySelectorAll(selector)].map((n) => n.textContent);

describe("module numbering restarts per module", () => {
  it("in the public course outline", () => {
    wrap(<CourseOutline course={course as never} />);
    const sections = [...document.querySelectorAll(".cp-module")] as HTMLElement[];
    expect(sections.map((s) => within(s).getByRole("heading").textContent)).toEqual(["Anatomy", "Physiology", "Histology"]);
    expect(sections.map((s) => numbersIn(s, ".cp-lesson__no"))).toEqual([["1", "2", "3"], ["1", "2"], ["1", "2"]]);
  });

  it("in the course editor", () => {
    wrap(<CourseModulesEditor courseId={"c1" as never} modules={modules as never} lessons={lessons as never} />);
    const groups = [...document.querySelectorAll(".cb-module")] as HTMLElement[];
    expect(groups.map((g) => numbersIn(g, ".cb-lesson__no"))).toEqual([["1", "2", "3"], ["1", "2"], ["1", "2"]]);
  });

  it("in the lesson breadcrumb", () => {
    const { rerender } = wrap(<CourseBreadcrumb courseId="c1" lessonId="l5" />);
    expect(screen.getByRole("navigation")).toHaveTextContent("Physiology›Lesson 2 / 2");
    rerender(<LocaleProvider initial="en"><CourseBreadcrumb courseId="c1" lessonId="l7" /></LocaleProvider>);
    expect(screen.getByRole("navigation")).toHaveTextContent("Histology›Lesson 2 / 2");
    rerender(<LocaleProvider initial="en"><CourseBreadcrumb courseId="c1" lessonId="l3" /></LocaleProvider>);
    expect(screen.getByRole("navigation")).toHaveTextContent("Anatomy›Lesson 3 / 3");
  });
});
