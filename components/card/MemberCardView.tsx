"use client";

import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Send, Wallet } from "lucide-react";
import { useCopy, useLocale } from "@/lib/i18n";
import { CARD_THEMES, memberCardGrain, memberCardPng, memberCardSvg, withGrainImage, type MemberCardData } from "@/lib/memberCard";
import "./card.css";
import { useEyesFollowPointer } from "./useEyesFollowPointer";
import { useFlip, useTilt } from "./useTilt";
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
/** `actions` adds more buttons to the end of the card's button row (the public page's "Get your own card"). */
export default function MemberCardView({ data, onStyle, framed = true, actions }: { data: MemberCardData; onStyle?: (style: number) => unknown; framed?: boolean; actions?: React.ReactNode }) {
  const t = useCopy(copy);
  const { locale } = useLocale();
  const card = { ...data, locale };
  // Total turn in degrees: each tap adds or takes away half a turn, so the card flips away from the side you pressed.
  const [turn, setTurn] = useState(0);
  const flipped = Math.abs(turn / 180) % 2 === 1;
  const flip = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    // Keyboard presses have no pointer position (detail 0): turn the default way.
    const left = e.detail > 0 && e.clientX < r.left + r.width / 2;
    setTurn((t) => t + (left ? -180 : 180));
  };
  const cardEl = useRef<HTMLButtonElement>(null);
  useFlip(cardEl, turn);
  const [status, setStatus] = useState("");
  const tilt = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEyesFollowPointer(root);
  useTilt(tilt);
  const wallet = useWalletAvailability();
  // Relative path so preview and self-hosted origins serve their own passes.
  const walletBase = `${new URL(data.url, "https://chaos.invalid").pathname}/wallet`;
  // Tilt (useTilt) uses CSS variables, so pointer moves never re-render the card.
  const grain = useGrain();
  const paint = (svg: string) => (grain ? withGrainImage(svg, grain) : svg);
  const front = paint(memberCardSvg(card, "front"));
  const back = paint(memberCardSvg(card, "back"));

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

  return (
    <div className={`mc ${cardRuqaa.variable}`} ref={root}>
      <div className={framed ? "mc-frame" : undefined}>
        {framed && <span className="mc-frame__label">{t.label}</span>}
        <div className="mc-stage" ref={tilt}>
          <div className="mc-tilt">
            <button type="button" className="mc-card" ref={cardEl} data-flipped={flipped} title={flipped ? t.flipBack : t.flip} onClick={flip} aria-label={`${t.cardOf(data.name)}. ${flipped ? t.flipBack : t.flip}`}>
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
        {actions}
      </div>
      <p className="mc-status" role="status">{status}</p>
    </div>
  );
}

/** The grain as a bitmap once it's ready; until then the card paints the filter itself. */
function useGrain() {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    memberCardGrain().then((url) => { if (live) setHref(url); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return href;
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
