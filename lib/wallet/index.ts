import "server-only";
import { createSign } from "node:crypto";
import { CARD_THEMES, memberNumber, memberTitle, type MemberCardData } from "@/lib/memberCard";
import { siteUrl } from "@/lib/site";

/*
 * Member card as a Google Wallet pass. It needs the operator's own Google Wallet issuer account
 * (see docs/self-hosting.md, "Wallet passes"); without it the button stays hidden and this returns null. Secrets are read on the server only and never sent to the browser.
 */

type Card = Omit<MemberCardData, "url" | "locale">;

const pem = (value: string | undefined) => {
  const raw = value?.trim();
  if (!raw) return undefined;
  // Accept PEM text or base64-encoded PEM (easier to paste into hosting dashboards).
  return raw.includes("-----BEGIN") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");
};
function googleConfig() {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID?.trim(), email = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL?.trim(), key = pem(process.env.GOOGLE_WALLET_PRIVATE_KEY);
  if (!issuerId || !/^\d+$/.test(issuerId) || !email || !key) return null;
  return { issuerId, email, key };
}

export const walletAvailability = () => ({ google: googleConfig() !== null });

const theme = (style: number) => CARD_THEMES[((style % CARD_THEMES.length) + CARD_THEMES.length) % CARD_THEMES.length];
const cardUrl = (card: Card) => `${siteUrl}/card/${encodeURIComponent(card.username)}`;
const since = (card: Card) => new Date(card.memberSince).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const base64url = (input: string | Buffer) => Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** A "Save to Google Wallet" link for the card, or null when Google Wallet isn't configured. */
export function googleSaveUrl(card: Card): string | null {
  const config = googleConfig();
  if (!config) return null;
  const look = theme(card.style);
  // Google IDs allow letters, digits, '.', '_' and '-'. Usernames already fit; the number keeps them unique.
  const classId = `${config.issuerId}.chaos_member_card`;
  const objectId = `${config.issuerId}.member_${memberNumber(card.seed)}_${card.username.replace(/[^a-z0-9_.-]/g, "_")}`;
  const text = (value: string) => ({ defaultValue: { language: "en-US", value } });
  const payload = {
    iss: config.email,
    aud: "google",
    typ: "savetowallet",
    origins: [siteUrl],
    payload: {
      genericClasses: [{ id: classId }],
      genericObjects: [{
        id: objectId,
        classId,
        state: "ACTIVE",
        hexBackgroundColor: look.paper,
        logo: { sourceUri: { uri: `${siteUrl}/wallet/logo.png` }, contentDescription: text("Chaos") },
        cardTitle: text("Chaos member card"),
        subheader: text(memberTitle(card.seed, "en")),
        header: text(card.name || `@${card.username}`),
        textModulesData: [
          { id: "username", header: "Username", body: `@${card.username}` },
          { id: "number", header: "No.", body: memberNumber(card.seed) },
          { id: "since", header: "Member since", body: since(card) },
        ],
        barcode: { type: "QR_CODE", value: cardUrl(card), alternateText: `@${card.username}` },
        linksModuleData: { uris: [{ uri: cardUrl(card), description: "Open card", id: "card" }] },
      }],
    },
  };
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(config.key);
  return `https://pay.google.com/gp/v/save/${unsigned}.${base64url(signature)}`;
}
