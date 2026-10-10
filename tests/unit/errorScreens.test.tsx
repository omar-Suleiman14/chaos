import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { LocaleProvider } from "@/lib/i18n";
import ErrorScreen from "@/components/site/ErrorScreen";
import NotFound from "@/app/[lang]/not-found";
import ErrorPage from "@/app/[lang]/error";
import DashboardError from "@/app/[lang]/(app)/dashboard/error";
import LearnError from "@/app/[lang]/(app)/dashboard/learn/error";
import GlobalError from "@/app/global-error";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ default: { captureException: capture } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));

const illustration = () => document.querySelector(".state-illustration");
const failure = Object.assign(new Error("boom"), { digest: "abc123" });

describe("not found", () => {
  it("draws the not-found illustration large, decoratively, and keeps the way home", async () => {
    const { container } = render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Nothing here" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
    expect(illustration()).toHaveAttribute("data-variant", "not-found");
    expect(illustration()).toHaveAttribute("data-size", "hero");
    expect(illustration()).toHaveAttribute("aria-hidden", "true");
    expect((await axe(container, { rules: { region: { enabled: false } } })).violations).toEqual([]);
  });

  it("speaks Arabic inside the Arabic site", () => {
    render(<LocaleProvider initial="ar"><NotFound /></LocaleProvider>);
    expect(screen.getByRole("heading", { level: 1, name: "لا شيء هنا" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "الصفحة الرئيسية" })).toHaveAttribute("href", expect.stringMatching(/^\/(ar)?\/?$/));
  });
});

describe("runtime errors", () => {
  it("draws the error illustration, not the not-found one, and keeps retry, capture and the reference", () => {
    const retry = vi.fn();
    render(<ErrorPage error={failure} reset={vi.fn()} retry={retry} />);
    expect(capture).toHaveBeenCalledWith(failure);
    expect(illustration()).toHaveAttribute("data-variant", "error");
    expect(illustration()).toHaveAttribute("data-size", "hero");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
    expect(screen.queryByText("boom")).toBeNull();
  });

  it("is translated in Arabic", () => {
    render(<LocaleProvider initial="ar"><ErrorPage error={failure} reset={vi.fn()} /></LocaleProvider>);
    expect(screen.getByRole("heading", { level: 1, name: "حدث خطأ ما" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حاول مرة أخرى" })).toBeInTheDocument();
  });

  it.each([
    ["dashboard", DashboardError, "Go to library", "/dashboard"],
    ["Learn", LearnError, "Go to Learn", "/dashboard/learn"],
  ] as const)("keeps the %s error inline with a compact drawing and its way back", (_, Page, label, href) => {
    const reset = vi.fn();
    render(<Page error={failure} reset={reset} />);
    expect(illustration()).toHaveAttribute("data-size", "compact");
    expect(illustration()).toHaveAttribute("data-variant", "error");
    expect(document.querySelector("main")).toBeNull();
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", expect.stringContaining(href));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
  });

  it("keeps the logo where no illustration is chosen", () => {
    render(<ErrorScreen title="Nothing here" body="Gone." primary={{ label: "Go home", href: "/" }} />);
    expect(illustration()).toBeNull();
    expect(document.querySelector('img[src="/icon.svg"]')).not.toBeNull();
  });
});

describe("root fallback", () => {
  it("draws the error illustration with its own dark tokens and no app stylesheet or provider", () => {
    const html = renderToStaticMarkup(<GlobalError error={failure} reset={vi.fn()} />);
    expect(html).toContain('href="/illustrations/error.svg#art"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/prefers-color-scheme: dark\)[^@]*--ill-ink: #d6d4cf/);
    expect(html).not.toContain("/icon.svg");
    expect(html).toContain("Reference: abc123");
  });
});
