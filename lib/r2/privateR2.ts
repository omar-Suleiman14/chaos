/**
 * Cloudflare R2's S3 SigV4 presigner. Runs in Convex's default web runtime;
 * credentials never leave server actions. No public bucket or SDK required.
 */
export type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};
export type R2Method = "GET" | "HEAD" | "PUT";

/** Shared deterministic key used only within private R2 actions and HTTP proxies. */
export const sourceR2Key = (sourceId: string) => "learn-sources/" + sourceId;

export function r2Config(env: Record<string, string | undefined>): R2Config {
  const accountId = env.CHAOS_R2_ACCOUNT_ID ?? "";
  const bucket = env.CHAOS_R2_BUCKET ?? "";
  const accessKeyId = env.CHAOS_R2_ACCESS_KEY_ID ?? "";
  const secretAccessKey = env.CHAOS_R2_SECRET_ACCESS_KEY ?? "";
  if (!/^[a-f0-9]{32}$/i.test(accountId) ||
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
      !accessKeyId || !secretAccessKey)
    throw new Error("Private R2 storage is not configured.");
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

const encoder = new TextEncoder();
function encoded(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, c =>
    "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
function hex(bytes: Uint8Array) {
  return [...bytes].map(v => v.toString(16).padStart(2, "0")).join("");
}
async function sha256(text: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))));
}
async function hmac(key: Uint8Array, input: string) {
  const imported = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, encoder.encode(input)));
}
export type SignedR2Request = { url: string; headers: Record<string, string> };

/**
 * Signed PUT requires Content-Type and If-None-Match: *, preventing a reusable
 * upload URL from overwriting the object after it was verified/published.
 * GET/HEAD signatures are consumed by the trusted server, not returned to users.
 */
export async function signR2Request(
  config: R2Config, method: R2Method, key: string,
  options: { contentType?: string; expiresSeconds?: number; now?: Date } = {},
): Promise<SignedR2Request> {
  if (!/^(?:course-media|form-images|learn-sources)\/[a-zA-Z0-9_-]{8,200}$/.test(key)) throw new Error("Invalid R2 object key.");
  const expires = options.expiresSeconds ?? 30;
  if (!Number.isSafeInteger(expires) || expires < 1 || expires > 300) throw new Error("Invalid expiry.");
  if (method === "PUT" && !options.contentType) throw new Error("Upload content type required.");
  if (method !== "PUT" && options.contentType) throw new Error("Unexpected content type.");
  const now = options.now ?? new Date();
  const timestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = timestamp.slice(0, 8);
  const host = config.accountId.toLowerCase() + ".r2.cloudflarestorage.com";
  const path = "/" + encoded(config.bucket) + "/" + key.split("/").map(encoded).join("/");
  const requestHeaders: Record<string, string> = method === "PUT"
    ? { "Content-Type": options.contentType!, "If-None-Match": "*" } : {};
  const signed = [
    ...Object.entries(requestHeaders).map(([k, value]) => [k.toLowerCase(), value.trim()] as const),
    ["host", host] as const,
  ].sort(([a], [b]) => a.localeCompare(b));
  const signedNames = signed.map(([name]) => name).join(";");
  const canonicalHeaders = signed.map(([name, value]) => name + ":" + value + "\n").join("");
  const scope = day + "/auto/s3/aws4_request";
  const params: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", config.accessKeyId + "/" + scope],
    ["X-Amz-Date", timestamp],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", signedNames],
  ];
  const query = params.map(([k, value]) => encoded(k) + "=" + encoded(value)).sort().join("&");
  const canonical = [method, path, query, canonicalHeaders, signedNames, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, await sha256(canonical)].join("\n");
  const dateKey = await hmac(encoder.encode("AWS4" + config.secretAccessKey), day);
  const regionKey = await hmac(dateKey, "auto");
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));
  return {
    url: "https://" + host + path + "?" + query + "&X-Amz-Signature=" + signature,
    headers: requestHeaders,
  };
}

export function validMediaSignature(type: string, bytes: Uint8Array) {
  const starts = (signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  if (type === "image/png") return starts([137, 80, 78, 71, 13, 10, 26, 10]);
  if (type === "image/jpeg") return starts([255, 216, 255]);
  if (type === "image/webp") return bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (type === "application/pdf") return starts([37, 80, 68, 70, 45]);
  return false;
}
