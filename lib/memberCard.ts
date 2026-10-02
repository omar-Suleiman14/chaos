import { blobatar } from "blobatar";
import { qrMatrix, QR_QUIET_ZONE } from "./qr";
import { avatarSeed } from "./avatarSeed";
export { avatarSeed };

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const ADJ = ["Industrious", "Curious", "Fearless", "Relentless", "Quiet", "Brilliant", "Restless", "Unstoppable", "Patient", "Wildly Organized", "Daring", "Thoughtful", "Bold", "Tireless", "Gentle", "Electric"];
const NOUN = ["Big Shot", "Quiz Wrangler", "Note Taker", "Question Asker", "Study Captain", "Form Builder", "Idea Collector", "Night Owl", "Chaos Tamer", "Deep Diver", "Fact Finder", "Explorer", "Puzzle Solver", "Bookworm", "Game Host", "Mind Mapper"];
const ADJ_AR = ["المجتهد", "الفضولي", "الجريء", "المثابر", "الهادئ", "اللامع", "النشيط", "الذي لا يتوقف", "الصبور", "شديد التنظيم", "المغامر", "المتأمل", "الواثق", "الدؤوب", "اللطيف", "المتّقد"];
const NOUN_AR = ["النجم", "صائد الاختبارات", "كاتب الملاحظات", "صاحب الأسئلة", "قائد المذاكرة", "صانع النماذج", "جامع الأفكار", "ساهر الليل", "مروّض الفوضى", "الغوّاص", "باحث الحقائق", "المستكشف", "حلّال الألغاز", "عاشق الكتب", "مضيف الألعاب", "راسم الخرائط"];

/** A playful, deterministic title like Arc's ("Industrious Big Shot"). */
export function memberTitle(seed: string, locale: "en" | "ar" = "en"): string {
  const h = hash(seed + ":title");
  return locale === "ar" ? `${NOUN_AR[(h >>> 4) % NOUN_AR.length]} ${ADJ_AR[h % ADJ_AR.length]}` : `${ADJ[h % ADJ.length]} ${NOUN[(h >>> 4) % NOUN.length]}`;
}

/** Four-digit member code printed on the card (not a sign-up rank). */
export function memberNumber(seed: string): string {
  return String(hash(seed + ":no") % 10000).padStart(4, "0");
}

export interface CardTheme { name: string; paper: string; ink: string; accent: string; art: [string, string, string]; hue: number }
export const CARD_THEMES: CardTheme[] = [
  { name: "Mint", paper: "#fdfbf0", ink: "#0f8a5f", accent: "#13a26f", art: ["#5cbfa6", "#a9d9cf", "#7cc7b8"], hue: 160 },
  { name: "Sunset", paper: "#fff8f0", ink: "#c2410c", accent: "#ea580c", art: ["#fb923c", "#fdba74", "#f472b6"], hue: 25 },
  { name: "Grape", paper: "#faf7ff", ink: "#6d28d9", accent: "#7c3aed", art: ["#a78bfa", "#c4b5fd", "#f0abfc"], hue: 275 },
  { name: "Ocean", paper: "#f4f9ff", ink: "#1d4ed8", accent: "#2563eb", art: ["#60a5fa", "#93c5fd", "#22d3ee"], hue: 215 },
  { name: "Citrus", paper: "#fffde8", ink: "#a16207", accent: "#ca8a04", art: ["#facc15", "#fde68a", "#a3e635"], hue: 60 },
  { name: "Rose", paper: "#fff5f7", ink: "#be123c", accent: "#e11d48", art: ["#fb7185", "#fda4af", "#f9a8d4"], hue: 345 },
  { name: "Midnight", paper: "#11131f", ink: "#c7d2fe", accent: "#818cf8", art: ["#312e81", "#4f46e5", "#0ea5e9"], hue: 235 },
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
const SANS = "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace";

/** Nested blobatar SVG positioned inside the card. The second group is the eyes, tagged so the view can aim them at the pointer. */
function blob(seed: string, x: number, y: number, size: number, hue?: number): string {
  const svg = blobatar(seed, hue === undefined ? {} : { hue });
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
  const dark = theme.paper.startsWith("#1");
  const muted = dark ? "rgba(199,210,254,.6)" : "rgba(0,0,0,.45)";
  const since = new Date(data.memberSince).toLocaleDateString(ar ? "ar-EG" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const no = memberNumber(data.seed);
  const [a, b, c] = theme.art;
  const defs = `<defs>
    <radialGradient id="@@g1" cx="25%" cy="20%" r="90%"><stop offset="0" stop-color="${b}"/><stop offset=".55" stop-color="${a}"/><stop offset="1" stop-color="${c}"/></radialGradient>
    <radialGradient id="@@g2" cx="80%" cy="90%" r="90%"><stop offset="0" stop-color="${c}"/><stop offset=".6" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>
    <filter id="@@paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 ${dark ? 1 : 0}  0 0 0 0 ${dark ? 1 : 0}  0 0 0 0 ${dark ? 1 : 0}  0 0 0 ${dark ? ".07" : ".11"} 0"/></filter>
    <filter id="@@fibre" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .45" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 ${dark ? 1 : 0}  0 0 0 0 ${dark ? 1 : 0}  0 0 0 0 ${dark ? 1 : 0}  0 0 0 ${dark ? ".05" : ".07"} 0"/></filter>
    <linearGradient id="@@edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${dark ? ".14" : ".9"}"/><stop offset="1" stop-color="#000" stop-opacity="${dark ? ".4" : ".1"}"/></linearGradient>
    <filter id="@@grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .09 0"/></filter>
    <clipPath id="@@art"><rect x="22" y="22" width="${W - 44}" height="270" rx="10"/></clipPath>
    <linearGradient id="@@logo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fca535"/><stop offset="1" stop-color="#e9482b"/></linearGradient>
    <linearGradient id="@@sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>`;
  // Card stock: fine grain and faint horizontal fibres over the whole card, with a lit top edge.
  const frame = `<rect width="${W}" height="${H}" rx="18" fill="${theme.paper}"/><rect width="${W}" height="${H}" rx="18" filter="url(#@@fibre)"/><rect width="${W}" height="${H}" rx="18" filter="url(#@@paper)"/><rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="17.5" fill="none" stroke="url(#@@edge)"/>`;
  const footer = `<g direction="ltr" font-family="${MONO}" font-size="10" font-weight="700" fill="${theme.ink}">
      <rect x="22" y="${H - 44}" width="168" height="22" rx="4" fill="none" stroke="${theme.ink}" stroke-width="1.4"/>
      <text x="32" y="${H - 29}">CHAOS</text>
      <rect x="72" y="${H - 44}" width="14" height="22" fill="${theme.ink}" opacity=".25"/>
      <text x="94" y="${H - 29}">No. ${no}</text>
      <text x="${W - 22}" y="${H - 36}" text-anchor="end" font-family="${ar ? SANS : SERIF}" font-size="11" font-weight="400">${ar ? "عضو منذ" : "MEMBER SINCE"}</text>
      <text x="${W - 22}" y="${H - 23}" text-anchor="end" font-family="${ar ? SANS : SERIF}" font-size="11" font-weight="400">${esc(since)}</text>
    </g>`;
  if (side === "back") {
    return `<svg xmlns="http://www.w3.org/2000/svg" direction="ltr" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs}${frame}
      <g clip-path="url(#@@art)"><rect x="22" y="22" width="${W - 44}" height="270" fill="url(#@@g2)"/><rect x="22" y="22" width="${W - 44}" height="270" filter="url(#@@grain)"/></g>
      ${qr(data.url, W / 2 - 92, 65, 184, dark ? "#ffffff" : "#111827", "@@logo")}
      <text x="${W / 2}" y="330" text-anchor="middle" font-family="${SANS}" font-size="16" font-weight="800" fill="${theme.ink}">${ar ? "امسح لترى البطاقة" : "Scan to see this card"}</text>
      <text x="${W / 2}" y="352" text-anchor="middle" font-family="${MONO}" font-size="11" fill="${muted}">${esc(data.url.replace(/^https?:\/\//, ""))}</text>
      ${blob(avatarSeed(data.username), W / 2 - 26, 372, 52, theme.hue)}
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
      <rect x="22" y="22" width="${W - 44}" height="270" filter="url(#@@grain)"/>
      <rect x="22" y="22" width="${W - 44}" height="270" fill="url(#@@sheen)"/>
    </g>
    <circle cx="${W / 2}" cy="${157}" r="72" fill="${theme.paper}" opacity=".22"/>
    ${blob(avatarSeed(data.username), W / 2 - 66, 91, 132, theme.hue)}
    <text ${tx} y="${H - 156}" font-family="${SANS}" font-size="${name.size}" font-weight="800"${ar ? "" : ` letter-spacing="-.5"`} fill="${theme.accent}">${esc(name.text)}</text>
    <text ${tx} y="${H - 132}" font-family="${ar ? SANS : MONO}" font-size="${ar ? 14 : 12.5}" fill="${theme.ink}">${esc(memberTitle(data.seed, data.locale))}</text>
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
