import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { LocaleProvider } from "@/lib/i18n";

const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: false }));
vi.mock("@/lib/auth/client", () => ({
  useUser: () => auth,
  SignUpButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/site/SiteLink", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { PrimaryCta } from "@/components/site/SiteChrome";

const renderCta = (locale: "en" | "ar" = "en") => render(<LocaleProvider initial={locale}><PrimaryCta large label={locale === "ar" ? "ابدأ مجانًا" : "Start free"} /></LocaleProvider>);

describe("landing page primary call to action", () => {
  it("asks visitors to sign up with the page's label", () => {
    auth.isSignedIn = false;
    renderCta();
    expect(screen.getByRole("button", { name: "Start free" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("sends signed-in people to the dashboard instead of a sign-up label", () => {
    auth.isSignedIn = true;
    renderCta();
    const open = screen.getByRole("link", { name: "Open Chaos" });
    expect(open.getAttribute("href")).toBe("/dashboard");
    expect(screen.queryByText("Start free")).toBeNull();
  });

  it("uses the Arabic open label when signed in", () => {
    auth.isSignedIn = true;
    renderCta("ar");
    expect(screen.getByRole("link", { name: "افتح Chaos" })).toBeTruthy();
  });
});
