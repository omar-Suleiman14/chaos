import { blobatar } from "blobatar";
import { parseAvatarSeed } from "./avatarSeed";
import { qrMatrix, QR_QUIET_ZONE } from "./qr";
import { avatarSeed } from "./avatarSeed";
export { avatarSeed };

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Two plain words, never more. Every entry is a single word in both languages.
const ADJ = ["Curious", "Steady", "Bold", "Quiet", "Bright", "Keen", "Patient", "Daring", "Thoughtful", "Tireless", "Gentle", "Clever", "Focused", "Calm", "Eager", "Sharp"];
const NOUN = ["Learner", "Builder", "Thinker", "Reader", "Maker", "Writer", "Teacher", "Scholar", "Planner", "Mentor", "Creator", "Student", "Solver", "Author", "Host", "Guide"];
const ADJ_AR = ["فضولي", "ثابت", "جريء", "هادئ", "لامع", "شغوف", "صبور", "مغامر", "متأمل", "دؤوب", "لطيف", "ذكي", "مركّز", "رزين", "متحمس", "نبيه"];
const NOUN_AR = ["متعلم", "بانٍ", "مفكر", "قارئ", "صانع", "كاتب", "معلم", "باحث", "مخطط", "مرشد", "مبدع", "طالب", "حلّال", "مؤلف", "مضيف", "دليل"];

/** A short, deterministic two-word title ("Curious Learner"). */
export function memberTitle(seed: string, locale: "en" | "ar" = "en"): string {
  const h = hash(seed + ":title");
  return locale === "ar" ? `${NOUN_AR[(h >>> 4) % NOUN_AR.length]} ${ADJ_AR[h % ADJ_AR.length]}` : `${ADJ[h % ADJ.length]} ${NOUN[(h >>> 4) % NOUN.length]}`;
}

/** Four-digit member code printed on the card (not a sign-up rank). */
export function memberNumber(seed: string): string {
  return String(hash(seed + ":no") % 10000).padStart(4, "0");
}

export interface CardTheme { name: string; paper: string; ink: string; accent: string; art: [string, string, string]; hue: number }
// Stored styles are indexes, so existing entries keep their position. New colours go at the end.
export const CARD_THEMES: CardTheme[] = [
  { name: "Mint", paper: "#fdfbf0", ink: "#0f8a5f", accent: "#13a26f", art: ["#5cbfa6", "#a9d9cf", "#7cc7b8"], hue: 160 },
  { name: "Sunset", paper: "#fff8f0", ink: "#c2410c", accent: "#ea580c", art: ["#fb923c", "#fdba74", "#f472b6"], hue: 25 },
  { name: "Grape", paper: "#faf7ff", ink: "#6d28d9", accent: "#7c3aed", art: ["#a78bfa", "#c4b5fd", "#f0abfc"], hue: 275 },
  { name: "Ocean", paper: "#f4f9ff", ink: "#1d4ed8", accent: "#2563eb", art: ["#60a5fa", "#93c5fd", "#22d3ee"], hue: 215 },
  { name: "Citrus", paper: "#fffde8", ink: "#a16207", accent: "#ca8a04", art: ["#facc15", "#fde68a", "#a3e635"], hue: 60 },
  { name: "Rose", paper: "#fff5f7", ink: "#be123c", accent: "#e11d48", art: ["#fb7185", "#fda4af", "#f9a8d4"], hue: 345 },
  { name: "Lagoon", paper: "#f2fbfb", ink: "#0f766e", accent: "#0d9488", art: ["#2dd4bf", "#99f6e4", "#38bdf8"], hue: 175 },
  { name: "Peach", paper: "#fff7f2", ink: "#9a3412", accent: "#f97316", art: ["#fdba74", "#fed7aa", "#fca5a5"], hue: 20 },
  { name: "Meadow", paper: "#f7fdf2", ink: "#3f6212", accent: "#65a30d", art: ["#a3e635", "#d9f99d", "#4ade80"], hue: 90 },
  { name: "Lilac", paper: "#fbf7ff", ink: "#7e22ce", accent: "#a855f7", art: ["#d8b4fe", "#f3e8ff", "#f9a8d4"], hue: 285 },
  { name: "Sky", paper: "#f5faff", ink: "#0369a1", accent: "#0284c7", art: ["#7dd3fc", "#e0f2fe", "#a5b4fc"], hue: 200 },
  { name: "Honey", paper: "#fffbeb", ink: "#92400e", accent: "#d97706", art: ["#fcd34d", "#fef3c7", "#fdba74"], hue: 45 },
  { name: "Midnight", paper: "#f3f4fb", ink: "#1e1b4b", accent: "#4338ca", art: ["#312e81", "#6366f1", "#0ea5e9"], hue: 240 },
  { name: "Ember", paper: "#fff6f3", ink: "#7f1d1d", accent: "#dc2626", art: ["#ef4444", "#f97316", "#facc15"], hue: 10 },
  { name: "Forest", paper: "#f3faf5", ink: "#14532d", accent: "#15803d", art: ["#166534", "#4ade80", "#bef264"], hue: 135 },
  { name: "Bubblegum", paper: "#fff4fb", ink: "#9d174d", accent: "#db2777", art: ["#f472b6", "#fbcfe8", "#c4b5fd"], hue: 325 },
  { name: "Slate", paper: "#f8fafc", ink: "#1e293b", accent: "#475569", art: ["#64748b", "#cbd5e1", "#94a3b8"], hue: 215 },
  { name: "Aurora", paper: "#f4fdfb", ink: "#134e4a", accent: "#0d9488", art: ["#34d399", "#818cf8", "#f0abfc"], hue: 170 },
  { name: "Sand", paper: "#fdfaf3", ink: "#78350f", accent: "#b45309", art: ["#e7c9a0", "#f5e6cc", "#d6a77a"], hue: 35 },
  { name: "Cherry", paper: "#fff5f5", ink: "#881337", accent: "#be123c", art: ["#9f1239", "#fb7185", "#fecdd3"], hue: 350 },
];

export interface MemberCardData {
  name: string;
  username: string;
  seed: string;
  memberSince: number;
  style: number;
  url: string;
  locale?: "en" | "ar";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const W = 340, H = 500;
/** Film grain over the art. Costly to paint, so the on-screen card swaps it for a bitmap (memberCardGrain). */
const GRAIN = `<feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="3" seed="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer>`;
const SANS = "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif";
const RUQAA = "var(--font-ruqaa), 'Aref Ruqaa', serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace";

/** Nested blobatar SVG positioned inside the card. The second group is the eyes, tagged so the view can aim them at the pointer. */
function blob(seed: string, x: number, y: number, size: number): string {
  const { name, hue } = parseAvatarSeed(seed);
  const svg = blobatar(name, hue === undefined ? undefined : { hue });
  let groups = 0;
  return svg.replace(/^<svg[^>]*>/, `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100" overflow="visible">`)
    .replace(/<g /g, (g) => (++groups === 2 ? '<g class="mc-eyes" ' : g));
}

/**
 * QR modules drawn straight onto the card art (no white backing) with the Chaos mark in the middle.
 * The code uses error-correction level H, so the small cleared centre stays scannable.
 */
function qr(url: string, x: number, y: number, size: number, ink: string, logoGradient: string): string {
  const { size: n, dark } = qrMatrix(url);
  const total = n + QR_QUIET_ZONE * 2;
  const hole = Math.round(n * 0.22) | 1;
  const from = (n - hole) / 2, to = from + hole;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (r >= from - 1 && r < to + 1 && c >= from - 1 && c < to + 1) continue;
    if (dark(c, r)) d += `M${c + QR_QUIET_ZONE} ${r + QR_QUIET_ZONE}h1v1h-1z`;
  }
  const lx = from + QR_QUIET_ZONE;
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}"><path d="${d}" fill="${ink}" shape-rendering="crispEdges"/><rect x="${lx}" y="${lx}" width="${hole}" height="${hole}" rx="${hole * 0.26}" fill="url(#${logoGradient})" stroke="#fff" stroke-opacity=".85" stroke-width=".35"/></svg>`;
}

function fitName(name: string): { text: string; size: number } {
  const text = name.trim() || "Chaos member";
  const size = text.length > 18 ? 22 : text.length > 12 ? 28 : 34;
  return { text: text.length > 26 ? text.slice(0, 25) + "…" : text, size };
}

/** The card as a standalone SVG string (front or back). Used on screen and for PNG download. */
export function memberCardSvg(data: MemberCardData, side: "front" | "back" = "front"): string {
  // Gradient/filter IDs are document-global: prefix them so both sides can sit on one page.
  return renderCard(data, side).split("@@").join(`mc-${side}-${memberNumber(data.seed)}-`);
}
function renderCard(data: MemberCardData, side: "front" | "back"): string {
  const theme = CARD_THEMES[((data.style % CARD_THEMES.length) + CARD_THEMES.length) % CARD_THEMES.length];
  const ar = data.locale === "ar";
  const muted = "rgba(0,0,0,.45)";
  const since = new Date(data.memberSince).toLocaleDateString(ar ? "ar-EG" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const no = memberNumber(data.seed);
  const [a, b, c] = theme.art;
  const defs = `<defs>
    <radialGradient id="@@g1" cx="25%" cy="20%" r="90%"><stop offset="0" stop-color="${b}"/><stop offset=".55" stop-color="${a}"/><stop offset="1" stop-color="${c}"/></radialGradient>
    <radialGradient id="@@g2" cx="80%" cy="90%" r="90%"><stop offset="0" stop-color="${c}"/><stop offset=".6" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>
    <filter id="@@grain" x="0" y="0" width="100%" height="100%">${GRAIN}</filter>
    <clipPath id="@@art"><rect x="22" y="22" width="${W - 44}" height="270" rx="10"/></clipPath>
    <linearGradient id="@@logo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fca535"/><stop offset="1" stop-color="#e9482b"/></linearGradient>
    <linearGradient id="@@sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>`;
  const frame = `<rect width="${W}" height="${H}" rx="18" fill="${theme.paper}"/>`;
  const footer = `<g direction="ltr" font-family="${MONO}" font-size="10" font-weight="700" fill="${theme.ink}">
      <rect x="22" y="${H - 44}" width="168" height="22" rx="4" fill="none" stroke="${theme.ink}" stroke-width="1.4"/>
      <text x="32" y="${H - 29}">CHAOS</text>
      <rect x="72" y="${H - 44}" width="14" height="22" fill="${theme.ink}" opacity=".25"/>
      <text x="94" y="${H - 29}">No. ${no}</text>
      <text x="${W - 22}" y="${H - 36}" text-anchor="end" font-family="${ar ? RUQAA : SERIF}" font-size="11" font-weight="400">${ar ? "عضو منذ" : "MEMBER SINCE"}</text>
      <text x="${W - 22}" y="${H - 23}" text-anchor="end" font-family="${ar ? RUQAA : SERIF}" font-size="11" font-weight="400">${esc(since)}</text>
    </g>`;
  if (side === "back") {
    return `<svg xmlns="http://www.w3.org/2000/svg" direction="ltr" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs}${frame}
      <g clip-path="url(#@@art)"><rect x="22" y="22" width="${W - 44}" height="270" fill="url(#@@g2)"/><rect x="22" y="22" width="${W - 44}" height="270" filter="url(#@@grain)" opacity=".28" style="mix-blend-mode:overlay"/></g>
      ${qr(data.url, W / 2 - 92, 65, 184, "#111827", "@@logo")}
      <text x="${W / 2}" y="330" text-anchor="middle" font-family="${SANS}" font-size="16" font-weight="800" fill="${theme.ink}">${ar ? "امسح لترى البطاقة" : "Scan to see this card"}</text>
      <text x="${W / 2}" y="352" text-anchor="middle" font-family="${MONO}" font-size="11" fill="${muted}">${esc(data.url.replace(/^https?:\/\//, ""))}</text>
      ${blob(data.seed, W / 2 - 26, 372, 52)}
      ${footer}</svg>`;
  }
  const name = fitName(data.name);
  // The page around the card may be RTL, so the SVG fixes its own direction. Arabic cards set the name block from
  // the right edge and never use the mono face or letter spacing (both break Arabic joins).
  const tx = ar ? `x="${W - 22}" direction="rtl"` : `x="22"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" direction="ltr" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs}${frame}
    <g clip-path="url(#@@art)">
      <rect x="22" y="22" width="${W - 44}" height="270" fill="url(#@@g1)"/>
      <path d="M22 168 Q ${W / 2} 108 ${W - 22} 168 L ${W - 22} 186 Q ${W / 2} 128 22 186 Z" fill="${theme.paper}"/>
      <rect x="22" y="186" width="${W - 44}" height="106" fill="url(#@@g2)" opacity=".9"/>
      <path d="M22 186 Q ${W / 2} 128 ${W - 22} 186 L ${W - 22} 292 L 22 292 Z" fill="url(#@@g2)"/>
      <rect x="22" y="22" width="${W - 44}" height="270" filter="url(#@@grain)" opacity=".28" style="mix-blend-mode:overlay"/>
      <rect x="22" y="22" width="${W - 44}" height="270" fill="url(#@@sheen)"/>
    </g>
    <circle cx="${W / 2}" cy="${157}" r="72" fill="${theme.paper}" opacity=".22"/>
    ${blob(data.seed, W / 2 - 66, 91, 132)}
    <text ${tx} y="${H - 156}" font-family="${ar ? RUQAA : SANS}" font-size="${name.size}" font-weight="${ar ? 700 : 800}"${ar ? "" : ` letter-spacing="-.5"`} fill="${theme.accent}">${esc(name.text)}</text>
    <text ${tx} y="${H - 132}" font-family="${ar ? RUQAA : MONO}" font-size="${ar ? 14 : 12.5}" fill="${theme.ink}">${esc(memberTitle(data.seed, data.locale))}</text>
    <text x="${ar ? W - 22 : 22}"${ar ? ` text-anchor="end"` : ""} y="${H - 110}" font-family="${MONO}" font-size="11" fill="${muted}">@${esc(data.username)}</text>
    ${footer}</svg>`;
}

/** PNG blob of one card side, rendered at `scale`× for crisp sharing. Browser only. */
export async function memberCardPng(data: MemberCardData, side: "front" | "back", scale = 3): Promise<Blob> {
  const svg = memberCardSvg(data, side);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));
}

let grain: Promise<string> | undefined;
/**
 * The grain painted once as a PNG (object URL, cached for the page). Repainting the live noise filter
 * every time the avatar's eyes move made the tilting card fall back to a blurry low-resolution copy.
 */
export function memberCardGrain(scale = 3): Promise<string> {
  grain ??= (async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W - 44} 270" width="${W - 44}" height="270"><filter id="g" x="0" y="0" width="100%" height="100%">${GRAIN}</filter><rect width="${W - 44}" height="270" filter="url(#g)"/></svg>`;
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = (W - 44) * scale; canvas.height = 270 * scale;
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Grain export failed"))), "image/png"));
    return URL.createObjectURL(png);
  })();
  grain.catch(() => { grain = undefined; });
  return grain;
}

/** Replaces the card's grain filter with the pre-painted grain image. */
export const withGrainImage = (svg: string, href: string) =>
  svg.replace(/<rect([^>]*?) filter="url\(#[^"]*grain\)"([^>]*)\/>/g, `<image href="${href}" preserveAspectRatio="none"$1$2/>`);
