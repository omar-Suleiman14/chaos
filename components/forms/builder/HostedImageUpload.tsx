"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { ImagePlus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useCopy } from "@/lib/i18n";
import type { Id } from "@/convex/_generated/dataModel";

const copy = {
  en: { upload: "Upload image", uploading: "Uploading?", invalid: "Choose a PNG, JPEG or WebP image up to 5 MiB.", failed: "Could not upload the image. Try again.", success: "Image uploaded. Add alternative text before publishing." },
  ar: { upload: "رفع صورة", uploading: "جارٍ الرفع…", invalid: "اختر صورة PNG أو JPEG أو WebP حتى 5 ميبيبايت.", failed: "تعذر رفع الصورة. حاول مجددًا.", success: "تم رفع الصورة. أضف نصًا بديلًا قبل النشر." },
};

/** Form-scoped R2 upload. The browser never obtains a signed GET capability. */
export default function HostedImageUpload({ formId, onUploaded }: {
  formId: Id<"forms">; onUploaded: (url: string, filename: string) => void;
}) {
  const t = useCopy(copy);
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => { onUploadedRef.current = onUploaded; }, [onUploaded]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
        throw new Error(t.invalid);
      const mediaId = await reserve({ formId, mimeType: file.type, bytes: file.size });
      const target = await getTarget({ mediaId });
      const response = await fetch(target.url, {
        method: "PUT", body: file, headers: target.headers, cache: "no-store",
      });
      if (!response.ok) throw new Error(t.failed);
      const url = await complete({ mediaId });
      if (mounted.current) { onUploadedRef.current(url, file.name); setUploaded(true); }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error && cause.message === t.invalid ? t.invalid : t.failed);
    } finally { if (mounted.current) setBusy(false); }
  };
  return <div className="space-y-1">
    <label className="ws-btn ws-btn--ghost ws-btn--sm inline-flex items-center gap-2 cursor-pointer">
      <ImagePlus size={15} aria-hidden="true" />
      {busy ? t.uploading : t.upload}
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
        className="sr-only" aria-label={t.upload}
        onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; void onFile(file); }} />
    </label>
    {uploaded && <output className="text-xs text-muted-foreground">{t.success}</output>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
