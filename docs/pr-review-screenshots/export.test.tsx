import { writeFileSync, mkdirSync } from "node:fs";
import { fireEvent, render, cleanup, waitFor } from "@testing-library/react";
import { it, vi, expect } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import CardCustomization from "@/components/card/CardCustomization";
import CourseStart from "@/components/courses/CourseStart";
import SettingsPage from "@/app/[lang]/(app)/dashboard/settings/page";
import PrivacyView from "@/components/site/PrivacyView";
import TermsView from "@/components/site/TermsView";
import CompareView from "@/components/site/CompareView";
import { RespondToForm } from "@/components/forms/respond/RespondPage";
import { themeFromPreset } from "@/components/forms/formThemes";
const fixture = vi.hoisted(() => ({ gate: false, lang: "en", theme: "light" }));
vi.mock("convex/react", () => ({
  useQuery: (_ref: unknown, args: unknown) => args === "skip" ? undefined : fixture.gate ? { state: "code", title: fixture.lang === "ar" ? "اختبار تدريبي" : "Practice quiz", defaultLanguage: fixture.lang, theme: themeFromPreset("flow") } : { hideStudentCards: false, studentCardsPublic: false },
  useMutation: () => async () => { throw new Error("RATE_LIMITED"); },
}));
vi.mock("@/lib/confirmedQuery", () => ({ useConfirmedQuery: () => ({ data: { hideStudentCards: false, studentCardsPublic: false } }) }));
vi.mock("@/lib/learn/courseProgress", () => ({ useCourseProgress: () => ({}) }));
vi.mock("@/lib/learn/courseEnrollment", () => ({ savedGuestName: () => "", useCourseEnrollment: () => ({ state: { enrolled: false }, signedIn: false, enroll: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/privacy", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth/client", () => ({ useUser: () => ({ isLoaded: true, isSignedIn: false }), useAuth: () => ({ isLoaded: true, isSignedIn: false }), SignInButton: ({children}: any) => children, SignUpButton: ({children}: any) => children, SignOutButton: ({children}: any) => children }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: fixture.theme, mode: fixture.theme, toggleTheme: vi.fn(), setMode: vi.fn() }) }));
it("exports actual component markup with synthetic account and form states", async () => {
  const out = "/workspace/.cloud-setup/chaos/merge-screenshots/markup";
  mkdirSync(out, { recursive: true });
  for (const lang of ["en", "ar"] as const) for (const theme of ["light", "dark"]) {
    fixture.lang = lang; fixture.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    const screens = {
      card: <CardCustomization card={{ name: "Demo Student", username: "demo.student", seed: "demo", style: 0, memberSince: 2026 }} actorId="demo" onboarding />,
      course: <main className="site-ui"><div className="cp"><h1>{lang === "ar" ? "دورة تدريبية" : "Demo course"}</h1><CourseStart course={{ id: "demo", lessons: [{id:"lesson"}] } as any} /></div></main>,
      settings: <main className="workspace-ui"><SettingsPage /></main>,
      privacy: <PrivacyView />, terms: <TermsView />, compare: <CompareView />,
      locked: <RespondToForm shareId="demo" />,
    };
    for (const [name, element] of Object.entries(screens)) {
      fixture.gate = name === "locked";
      const view = render(<LocaleProvider initial={lang}>{element}</LocaleProvider>);
      if (fixture.gate) {
        fireEvent.change(view.getByRole("textbox"), { target: { value: "wrong" } });
        fireEvent.submit(view.getByRole("textbox").closest("form")!);
        await waitFor(() => expect(view.getByRole("alert")).toBeVisible());
      }
      writeFileSync(`${out}/${name}-${lang}-${theme}.html`, view.container.innerHTML);
      cleanup();
    }
  }
});
