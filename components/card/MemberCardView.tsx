"use client";

import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Send, Wallet } from "lucide-react";
import { useCopy, useLocale } from "@/lib/i18n";
import { CARD_THEMES, memberCardPng, memberCardSvg, type MemberCardData } from "@/lib/memberCard";
import "./card.css";
import { useEyesFollowPointer } from "./useEyesFollowPointer";
import { cardRuqaa } from "@/lib/cardFonts";

const copy = {
  en: {
    label: "Your Chaos member card", flip: "Flip card", flipBack: "Show front", shuffle: "Change colours", download: "Download card",
    share: "Share card", google: "Add to Google Wallet", copied: "Link copied", shared: "Shared", failed: "Couldn't do that. Try again.", cardOf: (n: string) => `${n}'s Chaos member card`,
  },
  ar: {
    label: "بطاقة عضويتك في Chaos", flip: "اقلب البطاقة", flipBack: "اعرض الوجه", shuffle: "غيّر الألوان", download: "نزّل البطاقة",
    share: "شارك البطاقة", google: "أضف إلى Google Wallet", copied: "نُسخ الرابط", shared: "تمت المشاركة", failed: "تعذر ذلك. حاول مجددًا.", cardOf: (n: string) => `بطاقة عضوية ${n} في Chaos`,
  },
};

/**
 * Chaos member card: tilts toward the pointer, flips to a scannable QR code when tapped, and
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
  const wallet = useWalletAvailability();
  // Relative path so preview and self-hosted origins serve their own passes.
  const walletBase = `${new URL(data.url, "https://chaos.invalid").pathname}/wallet`;
  // Tilt uses CSS variables, so pointer moves never re-render the card.
  const front = memberCardSvg(card, "front");
  const back = memberCardSvg(card, "back");

  const say = (text: string) => { setStatus(text); window.setTimeout(() => setStatus(""), 2500); };
  // Both sides, as two PNGs: the front to show, the back with its scannable code.
  const sides = async () => Promise.all((["front", "back"] as const).map(async (side) =>
    new File([await memberCardPng(card, side)], `chaos-card-${data.username}-${side}.png`, { type: "image/png" })));
  const download = async () => {
    try {
      for (const file of await sides()) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file); a.download = file.name; a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        // Some browsers drop a second download started in the same tick.
        await new Promise((r) => window.setTimeout(r, 250));
      }
    } catch { say(t.failed); }
  };
  const share = async () => {
    try {
      const files = await sides();
      if (navigator.canShare?.({ files })) { await navigator.share({ files, title: t.cardOf(data.name), url: data.url }); say(t.shared); return; }
      if (navigator.canShare?.({ files: [files[0]] })) { await navigator.share({ files: [files[0]], title: t.cardOf(data.name), url: data.url }); say(t.shared); return; }
      if (navigator.share) { await navigator.share({ title: t.cardOf(data.name), url: data.url }); say(t.shared); return; }
      await navigator.clipboard.writeText(data.url); say(t.copied);
    } catch (err) { if (!(err instanceof DOMException && err.name === "AbortError")) say(t.failed); }
  };

  const move = (e: React.PointerEvent) => {
    const el = tilt.current; if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`); el.style.setProperty("--ry", `${(x * 14).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(x + 0.5) * 100}%`); el.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
  };
  const leave = () => { const el = tilt.current; if (el) { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); } };

  return (
    <div className={`mc ${cardRuqaa.variable}`} ref={root}>
      <div className={framed ? "mc-frame" : undefined}>
        {framed && <span className="mc-frame__label">{t.label}</span>}
        <div className="mc-stage" ref={tilt} onPointerMove={move} onPointerLeave={leave}>
          <div className="mc-tilt">
            <button type="button" className="mc-card" data-flipped={flipped} title={flipped ? t.flipBack : t.flip} onClick={() => setFlipped((f) => !f)} aria-label={`${t.cardOf(data.name)}. ${flipped ? t.flipBack : t.flip}`}>
              <span aria-hidden={flipped} className="mc-face mc-face--front" dangerouslySetInnerHTML={{ __html: front }} />
              <span aria-hidden={!flipped} className="mc-face mc-face--back" dangerouslySetInnerHTML={{ __html: back }} />
              <span className="mc-glare" aria-hidden />
            </button>
          </div>
        </div>
      </div>
      <div className="mc-actions" role="group" aria-label={t.label}>
        {onStyle && <button type="button" className="mc-btn" title={t.shuffle} aria-label={t.shuffle} onClick={() => void Promise.resolve().then(() => onStyle((data.style + 1) % CARD_THEMES.length)).catch(() => say(t.failed))}><RefreshCw size={18} aria-hidden /><span>{t.shuffle}</span></button>}
        <span className="mc-gap" />
        <button type="button" className="mc-btn" title={t.download} aria-label={t.download} onClick={() => void download()}><Download size={18} aria-hidden /><span>{t.download}</span></button>
        <button type="button" className="mc-btn" title={t.share} aria-label={t.share} onClick={() => void share()}><Send size={18} aria-hidden /><span>{t.share}</span></button>
        {wallet.google && <a className="mc-btn mc-btn--wallet" href={`${walletBase}/google`} target="_blank" rel="noopener"><Wallet size={18} aria-hidden /><span>{t.google}</span></a>}
      </div>
      <p className="mc-status" role="status">{status}</p>
    </div>
  );
}

/** Wallet buttons appear only on installations with issuer credentials (GET /api/wallet). */
function useWalletAvailability() {
  const [state, setState] = useState({ google: false });
  useEffect(() => {
    let live = true;
    fetch("/api/wallet").then((r) => (r.ok ? r.json() : null)).then((v) => { if (live && v) setState({ google: v.google === true }); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return state;
}
