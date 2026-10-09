import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";

vi.mock("convex/react", () => ({ useConvex: () => ({}), useQuery: () => undefined, useMutation: () => vi.fn(), useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }) }));
const { default: BlockRenderer } = await import("@/components/learn/reader/BlockRenderer");

const video = (url: string) => [{ id: "v", type: "video", props: { url, caption: "Portal circulation", name: "" }, children: [] }];
const show = (content: unknown[]) => render(<LocaleProvider initial="en"><BlockRenderer content={content as never} sources={[]} /></LocaleProvider>);

describe("video blocks in the reader", () => {
  it("plays a YouTube link in a plain video block as a YouTube embed with its own controls", () => {
    show(video("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s"));
    expect(screen.getByText("Portal circulation")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Play video, 1:30/ }));
    const frame = document.querySelector("iframe")!;
    expect(frame.src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    expect(frame.src).toContain("start=90");
    expect(frame.src).toContain("playsinline=1");
  });

  it("keeps any other video as a link", () => {
    show(video("https://example.com/clip.mp4"));
    expect(screen.getByRole("link", { name: "Portal circulation" })).toHaveAttribute("href", "https://example.com/clip.mp4");
    expect(document.querySelector("iframe, video")).toBeNull();
  });
});
