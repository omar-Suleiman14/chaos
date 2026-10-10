import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkWebhookUrl, isBlockedAddress } from "@/convex/webhookUrl";
import { backoffDelay, isRetryable, MAX_ATTEMPTS } from "@/convex/webhookModel";
import { decryptSecret, encryptSecret, signatureHeader, signPayload, verifySignature } from "@/convex/webhookCrypto";

describe("webhook destination checks", () => {
  it.each([
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "100.127.255.255", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255",
    "192.0.0.1", "192.0.2.1", "192.168.1.1", "198.18.0.1", "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.255.255.250", "255.255.255.255",
    "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::127.0.0.1", "64:ff9b::a9fe:a9fe", "2002:a00:1::", "fc00::1", "fd00:ec2::254",
    "fe80::1%eth0", "fec0::1", "ff02::1", "2001:db8::1", "2001:0:4136:e378::1", "not-an-ip",
    "::ffff:0:7f00:1", "::ffff:0:a00:1", "64:ff9b:1::a00:1", "64:ff9b:1:a00:1:0:808:808",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "100.128.0.1", "172.32.0.1", "2606:2800:220:1:248:1893:25c8:1946", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8", "::ffff:0:808:808"])(
    "allows public address %s",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );

  it("normalises and rejects numeric host forms", () => {
    for (const url of ["https://2130706433/", "https://0177.0.0.1/", "https://0x7f000001/", "https://127.1/"]) {
      expect(checkWebhookUrl(url)).toMatchObject({ ok: false, code: "ip_literal" });
    }
    expect(checkWebhookUrl("https://hooks.example.com/x?y=1")).toMatchObject({ ok: true, hostname: "hooks.example.com" });
    expect(checkWebhookUrl("https://hooks.example.com:8443/x")).toMatchObject({ ok: true });
    expect(checkWebhookUrl("http://localhost:3000/x")).toMatchObject({ ok: false, code: "https_required" });
    expect(checkWebhookUrl("http://localhost:3000/x", { allowLocalhost: true })).toMatchObject({ ok: true, insecureLocal: true });
  });
});

describe("webhook retry policy", () => {
  it("backs off exponentially with bounded jitter and a 6 hour ceiling", () => {
    expect(backoffDelay(1, 0.5)).toBe(30_000);
    expect(backoffDelay(2, 0.5)).toBe(120_000);
    expect(backoffDelay(3, 0.5)).toBe(480_000);
    expect(backoffDelay(10, 0.5)).toBe(6 * 3_600_000);
    expect(backoffDelay(1, 0)).toBe(27_000);
    expect(backoffDelay(1, 1)).toBe(33_000);
    expect(MAX_ATTEMPTS).toBeGreaterThan(1);
  });

  it("retries temporary failures only", () => {
    expect(isRetryable("http_error", 503)).toBe(true);
    expect(isRetryable("http_error", 404)).toBe(true);
    expect(isRetryable("http_error", 410)).toBe(false);
    expect(isRetryable("timeout")).toBe(true);
    expect(isRetryable("blocked_address")).toBe(false);
    expect(isRetryable("invalid_url")).toBe(false);
  });
});

describe("webhook signatures", () => {
  it("matches the documented Node verification recipe", async () => {
    const secret = "whsec_" + "ab".repeat(32);
    const body = JSON.stringify({ id: "evt_1", type: "webhook.test" });
    const expected = createHmac("sha256", secret).update(`1790000000.${body}`).digest("hex");
    expect(await signPayload(secret, 1790000000, body)).toBe(expected);
    const header = await signatureHeader([secret, "whsec_old"], 1790000000, body);
    expect(header).toBe(`t=1790000000,v1=${expected},v1=${await signPayload("whsec_old", 1790000000, body)}`);
    expect(await verifySignature(secret, header, body, { nowSeconds: 1790000100 })).toBe(true);
    expect(await verifySignature(secret, header, body, { nowSeconds: 1790000301 })).toBe(false);
  });

  it("encrypts secrets so they cannot be read without the key", async () => {
    const material = "k".repeat(40);
    const sealed = await encryptSecret("whsec_secret", material);
    expect(sealed).not.toContain("whsec_secret");
    expect(await decryptSecret(sealed, material)).toBe("whsec_secret");
    await expect(decryptSecret(sealed, "z".repeat(40))).rejects.toThrow();
  });
});
