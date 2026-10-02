"use client";

import { useState } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { useModal } from "@/components/workspace/useModal";
import { useCopy } from "@/lib/i18n";

const copy = { en: { close: "Close", zoomIn: "Zoom in", zoomOut: "Zoom out", reset: "Actual fit", viewer: "Image viewer" }, ar: { close: "إغلاق", zoomIn: "تكبير", zoomOut: "تصغير", reset: "الحجم الملائم", viewer: "عارض الصور" } };

/** Full-screen image/diagram viewer with keyboard zoom (+, -, 0) and Escape to close. */
export default function Lightbox({ url, alt, caption, onClose }: { url: string; alt: string; caption?: string; onClose: () => void }) {
  const t = useCopy(copy);
  const [zoom, setZoom] = useState(1);
  const panel = useModal<HTMLDivElement>({ onClose });
  const set = (z: number) => setZoom(Math.min(4, Math.max(0.5, Math.round(z * 4) / 4)));
  return (
    <div ref={panel} className="lx-lightbox" role="dialog" aria-modal="true" aria-label={alt || t.viewer} tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "+" || e.key === "=") { e.preventDefault(); set(zoom + 0.25); }
        if (e.key === "-") { e.preventDefault(); set(zoom - 0.25); }
        if (e.key === "0") { e.preventDefault(); set(1); }
      }}>
      <div className="lx-lightbox__bar">
        <button type="button" onClick={() => set(zoom - 0.25)} aria-label={t.zoomOut}><Minus size={18} /></button>
        <button type="button" onClick={() => set(1)} aria-label={t.reset}><RotateCcw size={18} /></button>
        <button type="button" onClick={() => set(zoom + 0.25)} aria-label={t.zoomIn}><Plus size={18} /></button>
        <button type="button" data-close onClick={onClose} aria-label={t.close}><X size={18} /></button>
      </div>
      <div className="lx-lightbox__stage" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <img src={url} alt={alt} style={{ maxWidth: zoom === 1 ? "min(100%, 1600px)" : undefined, maxHeight: zoom === 1 ? "calc(100dvh - 140px)" : undefined, transform: zoom === 1 ? undefined : `scale(${zoom})` }} />
      </div>
      {caption && <p className="lx-lightbox__caption">{caption}</p>}
    </div>
  );
}
