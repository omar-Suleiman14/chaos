import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CookieConsent, { CookieSettingsButton } from "@/components/CookieConsent";
import CookiesView from "@/components/site/CookiesView";
import { analyticsAllowed, CONSENT_COOKIE, CONSENT_DAYS, cookieConsent, saveCookieConsent } from "@/lib/cookieConsent";
import { LocaleProvider } from "@/lib/i18n";

vi.mock("@/lib/hosts", () => ({ sharedCookieDomain: () => "chaos.fail" }));

vi.mock("@/components/site/SiteLink", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/components/site/LegalPage", () => ({ default: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main> }));
beforeEach(() => {
  document.cookie = `${CONSENT_COOKIE}=; path=/; max-age=0`;
  window.dispatchEvent(new Event("focus"));
  Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: null });
  Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: false });
});
afterEach(() => vi.useRealTimers());

it("offers equally accessible allow and reject choices, then supports withdrawal", () => {
  render(<LocaleProvider initial="en"><CookieConsent /><CookieSettingsButton /></LocaleProvider>);
  expect(cookieConsent()).toBeNull();
  expect(analyticsAllowed()).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Allow analytics" }));
  expect(cookieConsent()).toBe(true);
  expect(analyticsAllowed()).toBe(true);
  expect(screen.queryByRole("region", { name: "Privacy choices" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cookie settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Reject analytics" }));
  expect(analyticsAllowed()).toBe(false);
  expect(document.cookie).toContain(CONSENT_COOKIE);
});

it("rejects invalid or expired choices and honors browser privacy signals", () => {
  document.cookie = `${CONSENT_COOKIE}=invalid; path=/`;
  expect(cookieConsent()).toBeNull();
  saveCookieConsent(true);
  Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "1" });
  expect(analyticsAllowed()).toBe(false);
  Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: null });
  Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: true });
  expect(analyticsAllowed()).toBe(false);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + CONSENT_DAYS * 86_400_000 + 1);
  expect(cookieConsent()).toBeNull();
});

it("updates when another tab changes the choice", () => {
  render(<LocaleProvider initial="en"><CookieConsent /></LocaleProvider>);
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(`1:no:${Date.now()}`)}; path=/`;
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "chaos-consent-change" })));
  expect(screen.queryByRole("region", { name: "Privacy choices" })).toBeNull();
  expect(analyticsAllowed()).toBe(false);
});

it.each([false, true])("keeps the %s choice after a remount and focus on a preview host", (choice) => {
  const view = render(<LocaleProvider initial="en"><CookieConsent /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: choice ? "Allow analytics" : "Reject analytics" }));
  expect(document.cookie).toContain(CONSENT_COOKIE);
  view.unmount();
  render(<LocaleProvider initial="en"><CookieConsent /></LocaleProvider>);
  act(() => window.dispatchEvent(new Event("focus")));
  expect(cookieConsent()).toBe(choice);
  expect(screen.queryByRole("region", { name: "Privacy choices" })).toBeNull();
});

it("provides the policy and consent choices in Arabic", () => {
  render(<LocaleProvider initial="ar"><CookieConsent /><CookiesView /></LocaleProvider>);
  expect(screen.getByRole("heading", { name: "سياسة ملفات تعريف الارتباط والتخزين" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "رفض التحليلات" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "السماح بالتحليلات" })).toBeInTheDocument();
});
