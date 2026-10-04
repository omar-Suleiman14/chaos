import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SiteLink from "@/components/site/SiteLink";
import { LocaleProvider } from "@/lib/i18n";

vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean | null }) => <a {...props} data-prefetch={prefetch === null ? "auto" : String(prefetch)} /> }));

describe("SiteLink", () => {
  it("waits for hover, focus or touch before prefetching", () => {
    render(<><SiteLink href="/pricing">Pricing</SiteLink><SiteLink href="/docs">Docs</SiteLink><SiteLink href="/learn">Learn</SiteLink></>);
    const [pricing, docs, learn] = ["Pricing", "Docs", "Learn"].map((name) => screen.getByRole("link", { name }));
    for (const link of [pricing, docs, learn]) expect(link).toHaveAttribute("data-prefetch", "false");
    fireEvent.mouseEnter(pricing);
    fireEvent.focus(docs);
    fireEvent.touchStart(learn);
    for (const link of [pricing, docs, learn]) expect(link).toHaveAttribute("data-prefetch", "auto");
  });

  it("keeps an explicit prefetch choice and the caller's handlers", () => {
    const onMouseEnter = vi.fn();
    render(<SiteLink href="/dashboard" prefetch={false} onMouseEnter={onMouseEnter}>Open</SiteLink>);
    const link = screen.getByRole("link", { name: "Open" });
    fireEvent.mouseEnter(link);
    expect(onMouseEnter).toHaveBeenCalledOnce();
    expect(link).toHaveAttribute("data-prefetch", "false");
  });

  it("points marketing pages at the reader's language", () => {
    render(<LocaleProvider initial="ar"><SiteLink href="/pricing">الأسعار</SiteLink><SiteLink href="/learn/abc">درس</SiteLink></LocaleProvider>);
    expect(screen.getByRole("link", { name: "الأسعار" })).toHaveAttribute("href", "/ar/pricing");
    expect(screen.getByRole("link", { name: "درس" })).toHaveAttribute("href", "/learn/abc");
  });
});
