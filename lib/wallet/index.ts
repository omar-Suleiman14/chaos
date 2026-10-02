import "server-only";
import { createSign } from "node:crypto";
import { PKPass } from "passkit-generator";
import { CARD_THEMES, memberNumber, memberTitle, type MemberCardData } from "@/lib/memberCard";
import { siteUrl } from "@/lib/site";
import { walletImages } from "./images";

/*
 * Member card as an Apple Wallet pass and a Google Wallet pass. Both need the operator's own issuer
 * credentials (see docs/self-hosting.md, "Wallet passes"); without them the buttons stay hidden and
 * these helpers return null. Secrets are read on the server only and never sent to the browser.
 */

type Card = Omit<MemberCardData, "url" | "locale">;

const pem = (value: string | undefined) => {
  const raw = value?.trim();
  if (!raw) return undefined;
  // Accept PEM text or base64-encoded PEM (easier to paste into hosting dashboards).
  return raw.includes("-----BEGIN") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");
};
function appleConfig() {
  const passTypeIdentifier = process.env.APPLE_WALLET_PASS_TYPE_ID?.trim(), teamIdentifier = process.env.APPLE_WALLET_TEAM_ID?.trim();
  const signerCert = pem(process.env.APPLE_WALLET_CERT), signerKey = pem(process.env.APPLE_WALLET_KEY), wwdr = pem(process.env.APPLE_WALLET_WWDR);
  if (!passTypeIdentifier || !teamIdentifier || !signerCert || !signerKey || !wwdr) return null;
  return { passTypeIdentifier, teamIdentifier, certificates: { signerCert, signerKey, wwdr, signerKeyPassphrase: process.env.APPLE_WALLET_KEY_PASSPHRASE || undefined } };
}
function googleConfig() {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID?.trim(), email = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL?.trim(), key = pem(process.env.GOOGLE_WALLET_PRIVATE_KEY);
  if (!issuerId || !/^\d+$/.test(issuerId) || !email || !key) return null;
  return { issuerId, email, key };
}

export const walletAvailability = () => ({ apple: appleConfig() !== null, google: googleConfig() !== null });

const theme = (style: number) => CARD_THEMES[((style % CARD_THEMES.length) + CARD_THEMES.length) % CARD_THEMES.length];
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const cardUrl = (card: Card) => `${siteUrl}/card/${encodeURIComponent(card.username)}`;
const since = (card: Card) => new Date(card.memberSince).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** A signed .pkpass for the card, or null when Apple Wallet isn't configured. */
export async function applePass(card: Card): Promise<Buffer | null> {
  const config = appleConfig();
  if (!config) return null;
  const look = theme(card.style);
  const dark = look.paper.startsWith("#1");
  const files: Record<string, Buffer> = {};
  for (const [name, b64] of Object.entries(walletImages)) files[name] = Buffer.from(b64, "base64");
  const pass = new PKPass(files, config.certificates, {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeIdentifier,
    teamIdentifier: config.teamIdentifier,
    serialNumber: `chaos-member-${memberNumber(card.seed)}-${card.username}`,
    organizationName: "Chaos",
    description: "Chaos member card",
    logoText: "Chaos",
    backgroundColor: rgb(look.paper),
    foregroundColor: rgb(look.ink),
    labelColor: dark ? "rgb(165, 180, 252)" : "rgb(110, 110, 115)",
    sharingProhibited: false,
  });
  pass.type = "generic";
  pass.primaryFields.push({ key: "name", label: "MEMBER", value: card.name || `@${card.username}` });
  pass.secondaryFields.push({ key: "title", label: "TITLE", value: memberTitle(card.seed, "en") }, { key: "username", label: "USERNAME", value: `@${card.username}` });
  pass.auxiliaryFields.push({ key: "number", label: "NO.", value: memberNumber(card.seed) }, { key: "since", label: "MEMBER SINCE", value: since(card) });
  pass.backFields.push({ key: "card", label: "Card", value: cardUrl(card) }, { key: "about", label: "About", value: "A Chaos member card. Scan the code to open the public card." });
  pass.setBarcodes({ format: "PKBarcodeFormatQR", message: cardUrl(card), messageEncoding: "iso-8859-1", altText: `@${card.username}` });
  return pass.getAsBuffer();
}

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
