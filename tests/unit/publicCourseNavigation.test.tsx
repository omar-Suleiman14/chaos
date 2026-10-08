import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
const data = vi.hoisted(() => ({ language: "en" }));
vi.mock("@/lib/learn/server", () => ({ fetchPublicCourse: async () => ({ id: "course1", title: "A course", language: data.language, lessons: [], tags: [], ownerName: "Author", ownerUsername: "author" }) }));
vi.mock("@/components/courses/CourseStart", () => ({ default: () => null }));
vi.mock("@/components/courses/CourseOutline", () => ({ default: () => null }));
vi.mock("@/components/site/SiteChrome", () => ({ SiteNav: () => null, SiteFooter: () => null }));
const { default: PublicCoursePage } = await import("@/app/[lang]/(app)/learn/courses/[id]/page");
for (const locale of ["en", "ar"] as const) it(`returns directly to the ${locale} course catalogue`, async () => {
 data.language = locale;
 const page = await PublicCoursePage({ params: Promise.resolve({id: "course1"}) });
 render(<LocaleProvider initial={locale}>{page}</LocaleProvider>);
 expect(screen.getByRole("link", { name: locale === "ar" ? "الدورات" : "Courses" })).toHaveAttribute("href", locale === "ar" ? "/ar/learn" : "/learn");
});
