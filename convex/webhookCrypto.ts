/**
 * Webhook secrets and signatures. Web Crypto only, so this runs in queries,
 * mutations and actions (both runtimes) and in tests.
 *
 * Secrets are needed in plaintext to compute HMACs, so they cannot be hashed like
 * connection tokens. They are encrypted with AES-256-GCM under a key derived from
 * the CHAOS_WEBHOOK_KEY deployment variable and decrypted only inside the
 * delivery action.
 */
import { env } from "./_generated/server";
import { randomHex } from "./serverUtils";

const encoder = new TextEncoder();

export function newWebhookSecret(): string {
  return `whsec_${randomHex(32)}`;
}

export function secretHint(secret: string): string {
  return `${secret.slice(0, 10)}…`;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reads CHAOS_WEBHOOK_KEY. Webhooks cannot be created or delivered without it. */
export function webhookKeyMaterial(): string {
  const key = env.CHAOS_WEBHOOK_KEY;
  if (!key || key.length < 32) {
    throw new Error("WEBHOOKS_NOT_CONFIGURED: Webhooks are not set up on this Chaos deployment (CHAOS_WEBHOOK_KEY is missing).");
  }
  return key;
}

async function aesKey(material: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`chaos-webhook-secret:${material}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(secret: string, material: string = webhookKeyMaterial()): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(material), encoder.encode(secret));
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(ct))}`;
}

export async function decryptSecret(ciphertext: string, material: string = webhookKeyMaterial()): Promise<string> {
  const [version, iv, ct] = ciphertext.split(":");
  if (version !== "v1" || !iv || !ct) throw new Error("Unknown webhook secret format");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await aesKey(material), fromBase64(ct));
  return new TextDecoder().decode(plain);
}

/** Hex HMAC-SHA256 of `${timestamp}.${body}` with the secret's UTF-8 bytes as the key. */
export async function signPayload(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`)));
}

/** `t=<unix seconds>,v1=<hex>[,v1=<hex>]`: one v1 per valid secret, newest first. */
export async function signatureHeader(secrets: string[], timestamp: number, body: string): Promise<string> {
  const parts = [`t=${timestamp}`];
  for (const secret of secrets) parts.push(`v1=${await signPayload(secret, timestamp, body)}`);
  return parts.join(",");
}

/** Compares two strings in time that depends only on their length. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Reference verifier, the same procedure documented for consumers: parse the
 * header, reject stale timestamps, then compare every v1 value in constant time.
 */
export async function verifySignature(
  secret: string,
  header: string,
  body: string,
  options: { nowSeconds?: number; toleranceSeconds?: number } = {},
): Promise<boolean> {
  let timestamp = NaN;
  const candidates: string[] = [];
  for (const part of header.split(",")) {
    const [k, value] = part.trim().split("=", 2);
    if (k === "t") timestamp = Number(value);
    else if (k === "v1" && value) candidates.push(value);
  }
  if (!Number.isInteger(timestamp) || !candidates.length) return false;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > (options.toleranceSeconds ?? 300)) return false;
  const expected = await signPayload(secret, timestamp, body);
  let match = false;
  for (const c of candidates) match = timingSafeEqualHex(expected, c) || match;
  return match;
}
