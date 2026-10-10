import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { LocaleProvider } from "@/lib/i18n";
import RespondError, { respondentIllustrationTokens } from "@/components/forms/respond/RespondError";
import { InitialThemeProvider } from "@/components/forms/respond/initial-theme";
import CardError from "@/app/[lang]/(app)/card/[username]/error";
import QuizLink from "@/app/[lang]/(app)/[username]/[quizname]/page";

vi.mock("@/lib/analytics", () => ({ default: { captureException: vi.fn() } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ username: "mona", quizname: "gone" }), usePathname: () => "/mona/gone", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("convex/react", () => ({ useQuery: (ref: Parameters<typeof getFunctionName>[0]) => (getFunctionName(ref) === "links:resolveLink" ? null : undefined), useMutation: () => vi.fn() }));

const art = () => document.querySelector<SVGElement>(".state-illustration");
const failure = Object.assign(new Error("secret detail"), { digest: "d1" });

describe("respondent form error", () => {
  it("draws the error illustration in the form's own colours, with no Chaos palette, and keeps retry and the reference", () => {
    const retry = vi.fn();
    render(<InitialThemeProvider theme={null}><RespondError error={failure} onRetry={retry} /></InitialThemeProvider>);
    expect(art()).toHaveAttribute("data-variant", "error");
    expect(art()).toHaveAttribute("aria-hidden", "true");
    expect(art()!.closest(".form-shell")).not.toBeNull();
    for (const [token, value] of Object.entries(respondentIllustrationTokens)) {
      expect(String(value)).toMatch(/var\(--form-/);
      expect(art()!.style.getPropertyValue(token)).toBe(value);
    }
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByText(/Reference: d1/)).toBeInTheDocument();
    expect(screen.queryByText("secret detail")).toBeNull();
    expect(document.querySelector('img[src="/icon.svg"]')).toBeNull();
  });

  it("maps every illustration token", () => {
    expect(Object.keys(respondentIllustrationTokens).sort()).toEqual(["--ill-accent", "--ill-ink", "--ill-leaf", "--ill-paper", "--ill-pop", "--ill-shade", "--ill-warm"]);
  });
});

describe("public card error", () => {
  it("draws the error illustration and keeps the localized retry", () => {
    const reset = vi.fn();
    render(<LocaleProvider initial="ar"><CardError reset={reset} /></LocaleProvider>);
    expect(art()).toHaveAttribute("data-variant", "error");
    // The card stays light in dark mode, so the drawing uses its light fallbacks.
    expect(art()!.style.getPropertyValue("--ill-ink")).toBe("initial");
    expect(screen.getByRole("heading", { level: 1, name: "البطاقة غير متاحة مؤقتًا" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حاول مجددًا" }));
    expect(reset).toHaveBeenCalled();
  });
});

describe("custom form link that resolves to nothing", () => {
  it("draws the not-found illustration, not the error one", () => {
    render(<QuizLink />);
    expect(screen.getByRole("heading", { level: 1, name: "Nothing here" })).toBeInTheDocument();
    expect(art()).toHaveAttribute("data-variant", "not-found");
  });
});
