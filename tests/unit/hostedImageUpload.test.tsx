import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({ resolve: undefined as undefined | ((value: string) => void) }));
vi.mock("@/lib/i18n", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/i18n")>()), useCopy: (copy: { en: unknown }) => copy.en }));
vi.mock("convex/react", () => ({
  useMutation: () => async () => "media-id",
  useAction: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref).endsWith("getUploadTarget")
    ? async () => ({ url: "https://bucket.example/upload", headers: {} })
    : () => new Promise<string>(resolve => { state.resolve = resolve; }),
}));
import HostedImageUpload from "@/components/forms/builder/HostedImageUpload";

afterEach(() => vi.unstubAllGlobals());

it("applies a finished upload to the latest editor callback", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
  const oldCallback = vi.fn(), latestCallback = vi.fn();
  const formId = "form" as Id<"forms">;
  const view = render(<HostedImageUpload formId={formId} onUploaded={oldCallback} />);
  fireEvent.change(screen.getByLabelText("Upload image"), { target: { files: [new File(["x"], "x.png", { type: "image/png" })] } });
  await waitFor(() => expect(state.resolve).toBeDefined());
  view.rerender(<HostedImageUpload formId={formId} onUploaded={latestCallback} />);
  state.resolve!("https://test.convex.site/forms/images/content?mediaId=one");
  await waitFor(() => expect(latestCallback).toHaveBeenCalledTimes(1));
  expect(oldCallback).not.toHaveBeenCalled();
});

it("does not apply an upload after its editor has unmounted", async () => {
  state.resolve = undefined;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
  const callback = vi.fn();
  const view = render(<HostedImageUpload formId={"form" as Id<"forms">} onUploaded={callback} />);
  fireEvent.change(screen.getByLabelText("Upload image"), { target: { files: [new File(["x"], "x.png", { type: "image/png" })] } });
  await waitFor(() => expect(state.resolve).toBeDefined());
  view.unmount();
  state.resolve!("https://test.convex.site/forms/images/content?mediaId=one");
  await Promise.resolve();
  expect(callback).not.toHaveBeenCalled();
});
