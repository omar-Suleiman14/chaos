import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto";
import { allowedPushEndpoint } from "@/convex/pushModel";

export type PushKeys = { publicKey: string; privateKey: string; subject: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string; locale: "en" | "ar" };

const unbase64 = (value: string) => Buffer.from(value, "base64url");
const b64 = (value: Buffer) => value.toString("base64url");

function expand(secret: Buffer, salt: Buffer, info: Buffer, size: number) {
  return Buffer.from(hkdfSync("sha256", secret, salt, info, size));
}

/** RFC 8291/8188 single-record aes128gcm + RFC 8292 VAPID ES256. No third-party relay. */
export function buildWebPush(target: PushTarget, keys: PushKeys) {
  if (!allowedPushEndpoint(target.endpoint)) throw new Error("UNSUPPORTED_PUSH_ENDPOINT");
  const receiverPub = unbase64(target.p256dh), authSecret = unbase64(target.auth);
  const vapidPrivate = unbase64(keys.privateKey), vapidPublic = unbase64(keys.publicKey);
  if (receiverPub.length !== 65 || receiverPub[0] !== 4 || authSecret.length !== 16 ||
      vapidPrivate.length !== 32 || vapidPublic.length !== 65 || vapidPublic[0] !== 4) throw new Error("INVALID_PUSH_KEYS");
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(keys.subject)) throw new Error("INVALID_VAPID_SUBJECT");
  const vapidPair = createECDH("prime256v1");
  vapidPair.setPrivateKey(vapidPrivate);
  if (!vapidPair.getPublicKey().equals(vapidPublic)) throw new Error("MISMATCHED_VAPID_KEYS");
  const vapidKey = createPrivateKey({ key: {
    kty: "EC", crv: "P-256", d: b64(vapidPrivate),
    x: b64(vapidPublic.subarray(1, 33)), y: b64(vapidPublic.subarray(33)),
  }, format: "jwk" });
  const endpoint = new URL(target.endpoint);
  const encodedHeader = b64(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const encodedClaims = b64(Buffer.from(JSON.stringify({
    aud: endpoint.origin, exp: Math.floor(Date.now() / 1000) + 3600, sub: keys.subject,
  })));
  const unsigned = encodedHeader + "." + encodedClaims;
  const jwt = unsigned + "." + b64(sign("sha256", Buffer.from(unsigned), { key: vapidKey, dsaEncoding: "ieee-p1363" }));

  const ephemeral = createECDH("prime256v1");
  ephemeral.generateKeys();
  const senderPub = ephemeral.getPublicKey(), shared = ephemeral.computeSecret(receiverPub);
  const salt = randomBytes(16);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), receiverPub, senderPub]);
  const ikm = expand(shared, authSecret, info, 32);
  const cek = expand(ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = expand(ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12);
  // Only the language is sent. No name, title, essay, marks, identifiers or deep link.
  const plain = Buffer.concat([Buffer.from(JSON.stringify({ lang: target.locale })), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4); recordSize.writeUInt32BE(4096);
  const body = Buffer.concat([salt, recordSize, Buffer.from([senderPub.length]), senderPub, ciphertext]);
  return { endpoint: endpoint.toString(), body: new Uint8Array(body), headers: {
    "Authorization": "vapid t=" + jwt + ", k=" + keys.publicKey,
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    "TTL": "600",
    "Urgency": "normal",
  } };
}
