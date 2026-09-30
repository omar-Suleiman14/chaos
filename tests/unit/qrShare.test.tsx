import { render, screen } from "@testing-library/react";
import jsQR from "jsqr";
import { describe, expect, it, vi } from "vitest";
import QrShare from "@/components/forms/builder/QrShare";
import ShareTab from "@/components/forms/builder/ShareTab";
import { qrPixels, qrSvg } from "@/lib/qr";

vi.mock("convex/react", () => ({
  useQuery: () => ({ username: "omar", enabled: false, anyOrigin: false, origins: [] }),
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

const decode = (url: string) => {
  const { data, width, height } = qrPixels(url, 6);
  return jsQR(data, width, height)?.data;
};

describe("QR sharing", () => {
  it("encodes exactly the public URL, dark on white with a quiet zone", () => {
    const url = "https://chaos.example/f/abc123XYZ";
    expect(decode(url)).toBe(url);
    const svg = qrSvg(url);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
  });

  it("renders the code with alt text and the readable link for a published form", () => {
    const url = "https://chaos.example/f/abc";
    render(<QrShare link={url} title="Quiz" published />);
    expect(screen.getByRole("img", { name: `QR code for ${url}` })).toBeInTheDocument();
    expect(screen.getByText(url)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download PNG/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download SVG/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show large/ })).toBeInTheDocument();
  });

  it("does not render a QR for drafts and says why", () => {
    render(<QrShare link="https://chaos.example/f/abc" title="Quiz" published={false} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/Publish the form to get a QR code/)).toBeInTheDocument();
  });

  it("ShareTab encodes the custom link when there is one, and nothing for drafts", () => {
    const { container, unmount } = render(<ShareTab formId={"f1" as never} shareId="sid" title="T" published status="live" slug="quiz" />);
    expect(container.querySelector("img[data-qr-link]")!.getAttribute("data-qr-link")).toBe(`${window.location.origin}/omar/quiz`);
    unmount();
    const draft = render(<ShareTab formId={"f1" as never} shareId="sid" title="T" published={false} status="draft" slug="quiz" />);
    expect(draft.container.querySelector("img[data-qr-link]")).toBeNull();
  });
});
