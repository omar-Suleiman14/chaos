// @vitest-environment node
import { readFileSync } from "node:fs";
import { createPublicKey, createVerify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Throwaway self-signed certificates, generated for this test only. They carry no trust.
const fixture = (name: string) => readFileSync(new URL(`../fixtures/wallet/${name}`, import.meta.url), "utf8");
const card = { name: "Omar Suleiman", username: "omar", seed: "user_abc", memberSince: Date.UTC(2026, 9, 1), style: 0 };

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("wallet passes", () => {
  it("are unavailable and return nothing without issuer credentials", async () => {
    vi.stubEnv("APPLE_WALLET_PASS_TYPE_ID", ""); vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "");
    const wallet = await import("@/lib/wallet");
    expect(wallet.walletAvailability()).toEqual({ apple: false, google: false });
    expect(await wallet.applePass(card)).toBeNull();
    expect(wallet.googleSaveUrl(card)).toBeNull();
  });

  it("builds a signed Apple pass with the card's public details and a QR code", async () => {
    vi.stubEnv("APPLE_WALLET_PASS_TYPE_ID", "pass.fail.chaos.member");
    vi.stubEnv("APPLE_WALLET_TEAM_ID", "ABCDE12345");
    vi.stubEnv("APPLE_WALLET_CERT", Buffer.from(fixture("signer.pem")).toString("base64"));
    vi.stubEnv("APPLE_WALLET_KEY", fixture("signer.key"));
    vi.stubEnv("APPLE_WALLET_WWDR", fixture("wwdr.pem"));
    const wallet = await import("@/lib/wallet");
    expect(wallet.walletAvailability().apple).toBe(true);
    const pass = await wallet.applePass(card);
    expect(pass).not.toBeNull();
    const zip = pass!.toString("latin1");
    expect(zip.startsWith("PK")).toBe(true);
    for (const entry of ["pass.json", "manifest.json", "signature", "icon.png", "logo.png"]) expect(zip).toContain(entry);
  });

  it("signs a Google save link that verifies with the issuer key and holds only public card data", async () => {
    vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "3388000000012345678");
    vi.stubEnv("GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL", "wallet@chaos-test.iam.gserviceaccount.com");
    vi.stubEnv("GOOGLE_WALLET_PRIVATE_KEY", fixture("signer.key"));
    const wallet = await import("@/lib/wallet");
    const url = wallet.googleSaveUrl(card)!;
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const [header, body, signature] = url.slice("https://pay.google.com/gp/v/save/".length).split(".");
    const verified = createVerify("RSA-SHA256").update(`${header}.${body}`).verify(createPublicKey(fixture("signer.key")), Buffer.from(signature, "base64url"));
    expect(verified).toBe(true);
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    expect(claims).toMatchObject({ aud: "google", typ: "savetowallet", iss: "wallet@chaos-test.iam.gserviceaccount.com" });
    const object = claims.payload.genericObjects[0];
    expect(object.id).toMatch(/^3388000000012345678\.member_\d{4}_omar$/);
    expect(object.barcode.value).toMatch(/\/card\/omar$/);
    expect(JSON.stringify(claims)).not.toContain("user_abc");
  });
});
