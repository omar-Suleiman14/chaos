"use client";

import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Repeat2, Send } from "lucide-react";
import { useCopy, useLocale } from "@/lib/i18n";
import { CARD_THEMES, memberCardPng, memberCardSvg, type MemberCardData } from "@/lib/memberCard";
import "./card.css";

const copy = {
  en: {
    label: "Your Chaos member card", flip: "Flip card", flipBack: "Show front", shuffle: "Change colours", download: "Download card",
    share: "Share card", copied: "Link copied", shared: "Shared", failed: "Couldn't do that. Try again.", cardOf: (n: string) => `${n}'s Chaos member card`,
  },
  ar: {
    label: "بطاقة عضويتك في Chaos", flip: "اقلب البطاقة", flipBack: "اعرض الوجه", shuffle: "غيّر الألوان", download: "نزّل البطاقة",
    share: "شارك البطاقة", copied: "نُسخ الرابط", shared: "تمت المشاركة", failed: "تعذر ذلك. حاول مجددًا.", cardOf: (n: string) => `بطاقة عضوية ${n} في Chaos`,
  },
};

/**
 * Chaos member card: tilts toward the pointer, flips to a scannable QR code, and
 * downloads as a crisp PNG. `onStyle` (owner only) cycles the colour theme.
 */
export default function MemberCardView({ data, onStyle, framed = true }: { data: MemberCardData; onStyle?: (style: number) => unknown; framed?: boolean }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const card = { ...data, locale };
  const [flipped, setFlipped] = useState(false);
  const [status, setStatus] = useState("");
  const tilt = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEyesFollowPointer(root);
  // Tilt uses CSS variables, so pointer moves never re-render the card.
  const front = memberCardSvg(card, "front");
  const back = memberCardSvg(card, "back");

  const say = (text: string) => { setStatus(text); window.setTimeout(() => setStatus(""), 2500); };
  const fileName = `chaos-card-${data.username}-${flipped ? "back" : "front"}.png`;
  const download = async () => {
    try {
      const blob = await memberCardPng(card, flipped ? "back" : "front");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch { say(t.failed); }
  };
  const share = async () => {
    try {
      const blob = await memberCardPng(card, "front");
      const file = new File([blob], `chaos-card-${data.username}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: t.cardOf(data.name), url: data.url }); say(t.shared); return; }
      if (navigator.share) { await navigator.share({ title: t.cardOf(data.name), url: data.url }); say(t.shared); return; }
      await navigator.clipboard.writeText(data.url); say(t.copied);
    } catch (err) { if (!(err instanceof DOMException && err.name === "AbortError")) say(t.failed); }
  };

  const move = (e: React.PointerEvent) => {
    const el = tilt.current; if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`); el.style.setProperty("--ry", `${(x * 8).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(x + 0.5) * 100}%`); el.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
  };
  const leave = () => { const el = tilt.current; if (el) { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); } };

  return (
    <div className="mc" ref={root}>
      <div className={framed ? "mc-frame" : undefined}>
        {framed && <span className="mc-frame__label">{t.label}</span>}
        <div className="mc-stage" ref={tilt} onPointerMove={move} onPointerLeave={leave}>
          <div className="mc-tilt">
            <button type="button" className="mc-card" data-flipped={flipped} onClick={() => setFlipped((f) => !f)} aria-label={`${t.cardOf(data.name)}. ${flipped ? t.flipBack : t.flip}`}>
              <span aria-hidden={flipped} className="mc-face mc-face--front" dangerouslySetInnerHTML={{ __html: front }} />
              <span aria-hidden={!flipped} className="mc-face mc-face--back" dangerouslySetInnerHTML={{ __html: back }} />
              <span className="mc-glare" aria-hidden />
            </button>
          </div>
        </div>
      </div>
      <div className="mc-actions" role="group" aria-label={t.label}>
        {onStyle && <button type="button" className="mc-btn" title={t.shuffle} aria-label={t.shuffle} onClick={() => void Promise.resolve().then(() => onStyle((data.style + 1) % CARD_THEMES.length)).catch(() => say(t.failed))}><RefreshCw size={18} aria-hidden /><span>{t.shuffle}</span></button>}
        <button type="button" className="mc-btn" title={flipped ? t.flipBack : t.flip} aria-label={flipped ? t.flipBack : t.flip} aria-pressed={flipped} onClick={() => setFlipped((f) => !f)}><Repeat2 size={18} aria-hidden /><span>{flipped ? t.flipBack : t.flip}</span></button>
        <span className="mc-gap" />
        <button type="button" className="mc-btn" title={t.download} aria-label={t.download} onClick={() => void download()}><Download size={18} aria-hidden /><span>{t.download}</span></button>
        <button type="button" className="mc-btn" title={t.share} aria-label={t.share} onClick={() => void share()}><Send size={18} aria-hidden /><span>{t.share}</span></button>
      </div>
      <p className="mc-status" role="status">{status}</p>
    </div>
  );
}

/** The avatar's eyes (.mc-eyes, tagged in lib/memberCard.ts) glance toward the pointer, a few units at most. */
function useEyesFollowPointer(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0, x = 0, y = 0;
    const aim = () => {
      frame = 0;
      root.current?.querySelectorAll<SVGGElement>(".mc-eyes").forEach((eyes) => {
        const box = (eyes.ownerSVGElement ?? eyes).getBoundingClientRect();
        if (!box.width) return;
        const dx = Math.max(-1, Math.min(1, (x - (box.left + box.width / 2)) / 260));
        const dy = Math.max(-1, Math.min(1, (y - (box.top + box.height / 2)) / 260));
        eyes.style.transform = `translate(${(dx * 4).toFixed(2)}px, ${(dy * 3).toFixed(2)}px)`;
      });
    };
    const move = (e: PointerEvent) => { x = e.clientX; y = e.clientY; if (!frame) frame = requestAnimationFrame(aim); };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(frame); };
  }, [root]);
}
