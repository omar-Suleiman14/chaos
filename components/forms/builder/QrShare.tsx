"use client";

import { useEffect, useMemo, useState } from "react";
import { useCopy } from "@/lib/i18n";
import { Download, Maximize2, X } from "lucide-react";
import { qrPng, qrSvg } from "@/lib/qr";
import { downloadBlob, safeFilename } from "@/lib/xlsx";

const copy = {
  en: {
    heading: "QR code",
    draft: "Publish the form to get a QR code. QR codes are not made for unpublished forms.",
    alt: (link: string) => `QR code for ${link}`,
    png: "Download PNG",
    svg: "Download SVG",
    large: "Show large",
    close: "Close",
    hint: "Prints and projects well. It always opens the link shown here.",
    dialog: "Large QR code",
    error: "Could not create the PNG.",
  },
  ar: {
    heading: "رمز QR",
    draft: "انشر النموذج للحصول على رمز QR. لا يُنشأ الرمز للنماذج غير المنشورة.",
    alt: (link: string) => `رمز QR للرابط ${link}`,
    png: "نزّل PNG",
    svg: "نزّل SVG",
    large: "عرض كبير",
    close: "إغلاق",
    hint: "مناسب للطباعة والعرض على الشاشة. يفتح دائمًا الرابط الظاهر هنا.",
    dialog: "رمز QR كبير",
    error: "تعذر إنشاء ملف PNG.",
  },
};

/** QR for the form's public link. Nothing is generated for drafts. */
export default function QrShare({ link, title, published }: { link: string; title: string; published: boolean }) {
  const t = useCopy(copy);
  const [big, setBig] = useState(false);
  const [error, setError] = useState("");
  const svg = useMemo(() => (published && link ? qrSvg(link) : ""), [published, link]);
  const src = svg ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` : "";
  const name = `${safeFilename(title)}-qr`;

  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setBig(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big]);

  if (!published) {
    return (
      <section className="chaos-card bg-card p-5 space-y-2" aria-label={t.heading}>
        <h2 className="chaos-heading text-sm">{t.heading}</h2>
        <p className="text-sm text-muted-foreground">{t.draft}</p>
      </section>
    );
  }

  return (
    <section className="chaos-card bg-card p-5 space-y-3" aria-label={t.heading}>
      <h2 className="chaos-heading text-sm">{t.heading}</h2>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={t.alt(link)} width={192} height={192} className="bg-white rounded" data-qr-link={link} />
      <p className="text-xs font-mono break-all" dir="ltr">{link}</p>
      <p className="text-xs text-muted-foreground">{t.hint}</p>
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => qrPng(link).then((b) => downloadBlob(b, `${name}.png`, "image/png")).catch(() => setError(t.error))}><Download size={14} /> {t.png}</button>
        <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => downloadBlob(svg, `${name}.svg`, "image/svg+xml")}><Download size={14} /> {t.svg}</button>
        <button type="button" className="kb-btn kb-btn-ghost text-xs" onClick={() => setBig(true)}><Maximize2 size={14} /> {t.large}</button>
      </div>
      {error && <p role="status" className="text-sm">{error}</p>}
      {big && (
        <div role="dialog" aria-modal="true" aria-label={t.dialog} className="fixed inset-0 z-50 bg-white text-black flex flex-col items-center justify-center gap-4 p-6">
          <button type="button" className="kb-btn kb-btn-ghost text-xs absolute top-4 end-4" onClick={() => setBig(false)}><X size={14} /> {t.close}</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={t.alt(link)} className="bg-white" style={{ width: "min(80vh, 90vw)", height: "min(80vh, 90vw)" }} />
          <p className="font-mono text-lg break-all text-center" dir="ltr">{link}</p>
        </div>
      )}
    </section>
  );
}
