import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { r2Config, signR2Request, validMediaSignature } from "../../lib/r2/privateR2";

const config = {
  accountId: "0123456789abcdef0123456789abcdef",
  bucket: "chaos-course-media",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-value",
};
const now = new Date("2026-11-14T12:00:00Z");

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());

describe("private R2 SigV4 infrastructure", () => {
  it("fails closed when configuration is missing or invalid", () => {
    expect(() => r2Config({})).toThrow("not configured");
    expect(() => r2Config({ CHAOS_R2_ACCOUNT_ID: config.accountId, CHAOS_R2_BUCKET: "Public!" })).toThrow();
    expect(r2Config({
      CHAOS_R2_ACCOUNT_ID: config.accountId,
      CHAOS_R2_BUCKET: config.bucket,
      CHAOS_R2_ACCESS_KEY_ID: config.accessKeyId,
      CHAOS_R2_SECRET_ACCESS_KEY: config.secretAccessKey,
    })).toEqual(config);
  });

  it("gives an expiring, create-only PUT capability without exposing credentials", async () => {
    const signed = await signR2Request(config, "PUT", "course-media/media_12345678", {
      contentType: "image/png", expiresSeconds: 60, now,
    });
    const url = new URL(signed.url);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe(config.accountId + ".r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/" + config.bucket + "/course-media/media_12345678");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(url.searchParams.get("X-Amz-Date")).toBe("20261114T120000Z");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host;if-none-match");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.headers).toEqual({ "Content-Type": "image/png", "If-None-Match": "*" });
    expect(signed.url).not.toContain(config.secretAccessKey);
    const retry = await signR2Request(config, "PUT", "course-media/media_12345678", {
      contentType: "image/png", expiresSeconds: 60, now,
    });
    expect(retry.url).toBe(signed.url);
    const changed = await signR2Request(config, "PUT", "course-media/media_12345678", {
      contentType: "image/jpeg", expiresSeconds: 60, now,
    });
    expect(new URL(changed.url).searchParams.get("X-Amz-Signature")).not.toBe(url.searchParams.get("X-Amz-Signature"));
  });

  it("rejects unexpected keys, methods, and excessively long-lived signed URLs", async () => {
    await expect(signR2Request(config, "GET", "../outside")).rejects.toThrow("key");
    await expect(signR2Request(config, "GET", "course-media/media_12345678", { expiresSeconds: 301 })).rejects.toThrow("expiry");
    await expect(signR2Request(config, "PUT", "course-media/media_12345678")).rejects.toThrow("content type");
    const get = await signR2Request(config, "GET", "course-media/media_12345678", { now });
    expect(new URL(get.url).searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(get.headers).toEqual({});
    const head = await signR2Request(config, "HEAD", "course-media/media_12345678", { now });
    expect(head.url).not.toEqual(get.url);
  });

  it("checks file magic bytes rather than trusting the browser MIME", () => {
    expect(validMediaSignature("image/png", Uint8Array.from([137,80,78,71,13,10,26,10]))).toBe(true);
    expect(validMediaSignature("image/jpeg", Uint8Array.from([255,216,255,0]))).toBe(true);
    expect(validMediaSignature("image/webp", new TextEncoder().encode("RIFF1234WEBP"))).toBe(true);
    expect(validMediaSignature("application/pdf", new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(validMediaSignature("application/pdf", new TextEncoder().encode("<script>"))).toBe(false);
    expect(validMediaSignature("image/png", new Uint8Array())).toBe(false);
    expect(validMediaSignature("application/zip", new Uint8Array())).toBe(false);
  });
});
