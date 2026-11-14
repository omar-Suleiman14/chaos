"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { ImagePlus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Form-scoped R2 upload. The browser never obtains a signed GET capability. */
export default function HostedImageUpload({ formId, onUploaded }: {
  formId: Id<"forms">; onUploaded: (url: string, filename: string) => void;
}) {
  const reserve = useMutation(api.formImageMedia.reserveUpload);
  const getTarget = useAction(api.formImageMedia.getUploadTarget);
  const complete = useAction(api.formImageMedia.completeUpload);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const onFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setUploaded(false);
    setError(null);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024)
        throw new Error("Only PNG, JPEG or WebP images up to 5 MiB are supported.");
      const mediaId = await reserve({ formId, mimeType: file.type, bytes: file.size });
      const target = await getTarget({ mediaId });
      const response = await fetch(target.url, {
        method: "PUT", body: file, headers: target.headers, cache: "no-store",
      });
      if (!response.ok) throw new Error("Image upload failed. Check R2 CORS and try again.");
      const url = await complete({ mediaId });
      onUploaded(url, file.name);
      setUploaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image upload failed.");
    } finally { setBusy(false); }
  };
  return <div className="space-y-1">
    <label className="ws-btn ws-btn--ghost ws-btn--sm inline-flex items-center gap-2 cursor-pointer">
      <ImagePlus size={15} aria-hidden="true" />
      {busy ? "Uploading…" : "Upload image to R2"}
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
        className="sr-only" aria-label="Upload image to R2"
        onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; void onFile(file); }} />
    </label>
    {uploaded && <p role="status" className="text-xs text-muted-foreground">Image uploaded. Add a descriptive alternative text before publishing.</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
