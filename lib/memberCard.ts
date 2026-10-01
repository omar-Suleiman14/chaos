import { blobatar } from "blobatar";
import { qrMatrix, QR_QUIET_ZONE } from "./qr";
export { avatarSeed } from "./avatarSeed";

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const ADJ = ["Industrious", "Curious", "Fearless", "Relentless", "Quiet", "Brilliant", "Restless", "Unstoppable", "Patient", "Wildly Organized", "Daring", "Thoughtful", "Bold", "Tireless", "Gentle", "Electric"];
const NOUN = ["Big Shot", "Quiz Wrangler", "Note Taker", "Question Asker", "Study Captain", "Form Builder", "Idea Collector", "Night Owl", "Chaos Tamer", "Deep Diver", "Fact Finder", "Explorer", "Puzzle Solver", "Bookworm", "Game Host", "Mind Mapper"];
const ADJ_AR = ["المجتهد", "الفضولي", "الجريء", "المثابر", "الهادئ", "اللامع", "النشيط", "الذي لا يتوقف", "الصبور", "شديد التنظيم", "المغامر", "المتأمل", "الواثق", "الدؤوب", "اللطيف", "المتّقد"];
const NOUN_AR = ["النجم", "صائد الاختبارات", "كاتب الملاحظات", "صاحب الأسئلة", "قائد المذاكرة", "صانع النماذج", "جامع الأفكار", "ساهر الليل", "مروّض الفوضى", "الغوّاص", "باحث الحقائق", "المستكشف", "حلّال الألغاز", "عاشق الكتب", "مضيف الألعاب", "راسم الخرائط"];

/** A playful, deterministic title for a Chaos member. */
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
const W = 340, H = 440;
const SANS = "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace";

/** Nested blobatar SVG positioned inside the card. */
function blob(seed: string, x: number, y: number, size: number, hue?: number): string {
  const svg = blobatar(seed, hue === undefined ? {} : { hue });
  return svg.replace(/^<svg[^>]*>/, `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100">`);
}

function qr(url: string, x: number, y: number, size: number, ink: string, paper: string): string {
  const { size: n, dark } = qrMatrix(url);
  const total = n + QR_QUIET_ZONE * 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(c, r)) d += `M${c + QR_QUIET_ZONE} ${r + QR_QUIET_ZONE}h1v1h-1z`;
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" rx="3" fill="${paper}"/><path d="${d}" fill="${ink}"/></svg>`;
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
  const since = new Date(data.memberSince).toLocaleDateString(ar ? "ar-EG" : "en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  const edge = ar ? W - 28 : 28;
  const anchor = ar ? "end" : "start";
  const base = `<rect width="${W}" height="${H}" rx="12" fill="${theme.paper}"/><rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="none" stroke="${theme.ink}" stroke-opacity=".2"/>
    <text x="28" y="42" font-family="${SANS}" font-size="18" font-weight="800" fill="${theme.ink}">Chaos</text>
    <text x="312" y="42" text-anchor="end" font-family="${MONO}" font-size="10" fill="${theme.ink}">#${memberNumber(data.seed)}</text>
    <path d="M28 62H312 M28 374H312" stroke="${theme.ink}" stroke-opacity=".18"/>
    <text x="${edge}" y="402" text-anchor="${anchor}" font-family="${SANS}" font-size="11" fill="${theme.ink}">${ar ? "??? ???" : "Member since"} ${esc(since)}</text>`;
  const content = side === "back"
    ? `${qr(data.url, 78, 88, 184, "#111827", "#ffffff")}
       <text x="170" y="308" text-anchor="middle" font-family="${SANS}" font-size="16" font-weight="600" fill="${theme.ink}">${ar ? "???? ???? ???????" : "Scan to view card"}</text>
       <text x="170" y="336" text-anchor="middle" font-family="${MONO}" font-size="11" fill="${theme.ink}">/card/${esc(data.username)}</text>`
    : `<rect x="28" y="86" width="112" height="112" rx="16" fill="${theme.accent}" fill-opacity=".1"/>${blob(data.seed, 36, 94, 96)}
       <text x="${edge}" y="246" text-anchor="${anchor}" direction="${ar ? "rtl" : "ltr"}" font-family="${SANS}" font-size="${fitName(data.name).size}" font-weight="700" fill="${theme.ink}">${esc(fitName(data.name).text)}</text>
       <text x="${edge}" y="276" text-anchor="${anchor}" font-family="${MONO}" font-size="13" fill="${theme.ink}">@${esc(data.username)}</text>
       <text x="${edge}" y="326" text-anchor="${anchor}" direction="${ar ? "rtl" : "ltr"}" font-family="${SANS}" font-size="12" fill="${theme.ink}">${esc(memberTitle(data.seed, data.locale))}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${base}${content}</svg>`;
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
