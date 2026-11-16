import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({ url: "https://test.convex.site/learn/question-images/content?mediaId=one" as string | null, token: "private-token" }));
vi.mock("convex/react", () => ({ useQuery: () => state.url }));
vi.mock("@/lib/auth/client", () => ({ useAuth: () => ({ getToken: async () => state.token }) }));
vi.mock("next/image", () => ({ default: (props: { src: string; alt: string }) => {
  // eslint-disable-next-line @next/next/no-img-element -- Tests inspect the underlying image URL.
  return <img src={props.src} alt={props.alt} />;
} }));
import PrivateCaseImage from "@/components/courses/PrivateCaseImage";

afterEach(() => vi.unstubAllGlobals());

it("fetches private images with an auth token and revokes the object URL", async () => {
  const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => new Response(new Blob(["image"]), { status: 200 }));
  const create = vi.fn(() => "blob:private-image"), revoke = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  const view = render(<PrivateCaseImage mediaId={"one" as Id<"questionBankMedia">} alt="ECG" />);
  await waitFor(() => expect(screen.getByRole("img", { name: "ECG" })).toHaveAttribute("src", "blob:private-image"));
  expect(fetchMock).toHaveBeenCalledWith(state.url, expect.objectContaining({ headers: { Authorization: "Bearer private-token" }, cache: "no-store" }));
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:private-image");
});

it("clears an authorized preview when the access URL is revoked", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["image"]), { status: 200 })));
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:private-image"), revokeObjectURL: vi.fn(),
  }));
  const view = render(<PrivateCaseImage mediaId={"one" as Id<"questionBankMedia">} alt="ECG" />);
  await waitFor(() => expect(screen.getByRole("img", { name: "ECG" })).toBeInTheDocument());
  state.url = null;
  view.rerender(<PrivateCaseImage mediaId={"one" as Id<"questionBankMedia">} alt="ECG" />);
  await waitFor(() => expect(screen.queryByRole("img", { name: "ECG" })).toBeNull());
  expect(screen.getByText("ECG")).toBeInTheDocument();
});
