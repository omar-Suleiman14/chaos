import { createDecipheriv, createECDH, hkdfSync, verify, createPublicKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildWebPush } from "@/lib/push/webPush";
import { allowedPushEndpoint, validWebPushKey } from "@/convex/pushModel";

const hk = (secret: Buffer, salt: Buffer, info: Buffer, len: number) =>
  Buffer.from(hkdfSync("sha256", secret, salt, info, len));

describe("web push security", () => {
  it("rejects untrusted endpoints, internal addresses and invalid keys", () => {
    for (const url of ["http://localhost/push", "https://127.0.0.1/foo", "https://fcm.googleapis.com.evil.com/a", "https://google.com/push", "https://fcm.googleapis.com:8443/a", "https://user@fcm.googleapis.com/a"]) {
      expect(allowedPushEndpoint(url)).toBe(false);
    }
    expect(allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/test")).toBe(true);
    expect(allowedPushEndpoint("https://web.push.apple.com/push/abc")).toBe(true);
    expect(allowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/test")).toBe(true);
    expect(validWebPushKey("A".repeat(1000), 160)).toBe(false);
  });

  it("creates an authenticated VAPID token and decryptable RFC 8291 payload with no private information", () => {
    const vapid = createECDH("prime256v1"); vapid.generateKeys();
    const recipient = createECDH("prime256v1"); recipient.generateKeys();
    const auth = Buffer.alloc(16, 17);
    const request = buildWebPush({
      endpoint: "https://fcm.googleapis.com/fcm/send/test",
      p256dh: recipient.getPublicKey().toString("base64url"),
      auth: auth.toString("base64url"), locale: "ar",
    }, {
      publicKey: vapid.getPublicKey().toString("base64url"),
      privateKey: vapid.getPrivateKey().toString("base64url"),
      subject: "mailto:notifications@chaos.fail",
    });
    const token = request.headers.Authorization.match(/^vapid t=([^,]+), k=/)?.[1];
    expect(token).toBeTruthy();
    const [header, claims, signature] = token!.split(".");
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toMatchObject({
      aud: "https://fcm.googleapis.com", sub: "mailto:notifications@chaos.fail",
    });
    const verifyingKey = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: vapid.getPublicKey().subarray(1, 33).toString("base64url"),
        y: vapid.getPublicKey().subarray(33).toString("base64url") },
      format: "jwk",
    });
    expect(verify("sha256", Buffer.from(header + "." + claims),
      { key: verifyingKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))).toBe(true);
    const body = Buffer.from(request.body);
    expect(body.subarray(16, 20).readUInt32BE()).toBe(4096);
    const senderPub = body.subarray(21, 21 + body[20]);
    const shared = recipient.computeSecret(senderPub);
    const ikm = hk(shared, auth, Buffer.concat([Buffer.from("WebPush: info\0"), recipient.getPublicKey(), senderPub]), 32);
    const salt = body.subarray(0, 16);
    const key = hk(ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
    const nonce = hk(ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12);
    const encrypted = body.subarray(21 + body[20]);
    const decipher = createDecipheriv("aes-128-gcm", key, nonce);
    decipher.setAuthTag(encrypted.subarray(-16));
    const plain = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
    expect(plain.subarray(-1)[0]).toBe(2);
    expect(JSON.parse(plain.subarray(0, -1).toString())).toEqual({ lang: "ar" });
    expect(plain.toString()).not.toMatch(/mark|student|answer|courseId|essay|name/i);
  });
});
