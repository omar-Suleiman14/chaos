"use node";
/**
 * Sends one webhook attempt. Runs in the Node runtime so the destination can be
 * resolved and checked before connecting, and the connection pinned to the
 * checked address (no second lookup that DNS rebinding could change).
 */
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { decryptSecret, signatureHeader } from "./webhookCrypto";
import { REQUEST_TIMEOUT_MS } from "./webhookModel";
import type { AttemptOutcome } from "./webhookModel";
import { checkWebhookUrl, isBlockedAddress } from "./webhookUrl";

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type SendRequest = { url: URL; address: ResolvedAddress; headers: Record<string, string>; body: string; timeoutMs: number };
export type SendResult = { statusCode: number } | { error: "timeout" | "network_error"; detail?: string };

/**
 * Network access, replaceable in tests. `resolve` returns every address for a
 * host name; `send` POSTs to a pre-resolved address without following redirects.
 */
export const transport = {
  async resolve(hostname: string): Promise<ResolvedAddress[]> {
    const rows = await lookup(hostname, { all: true, verbatim: true });
    return rows.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
  },
  send(request: SendRequest): Promise<SendResult> {
    return new Promise((resolve) => {
      const { url, address } = request;
      // Pin the socket to the address that was checked; TLS still verifies the certificate for the host name.
      const pinned: LookupFunction = (_host, options, callback) => {
        if (options && typeof options === "object" && options.all) {
          (callback as unknown as (err: null, list: { address: string; family: number }[]) => void)(null, [{ address: address.address, family: address.family }]);
        } else callback(null, address.address, address.family);
      };
      const client = url.protocol === "http:" ? http : https;
      let settled = false;
      const finish = (result: SendResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const req = client.request(
        {
          protocol: url.protocol, hostname: url.hostname, port: url.port || undefined, path: `${url.pathname}${url.search}`,
          method: "POST", headers: { ...request.headers, "Content-Length": String(Buffer.byteLength(request.body)) },
          lookup: pinned, agent: false,
        },
        (res) => {
          // The body is read (up to 16 KiB) only so the connection closes cleanly; it is never stored.
          let seen = 0;
          res.on("data", (chunk: Buffer) => { seen += chunk.length; if (seen > 16_384) res.destroy(); });
          res.on("end", () => finish({ statusCode: res.statusCode ?? 0 }));
          res.on("close", () => finish({ statusCode: res.statusCode ?? 0 }));
          res.on("error", () => finish({ statusCode: res.statusCode ?? 0 }));
        },
      );
      const timer = setTimeout(() => { finish({ error: "timeout" }); req.destroy(); }, request.timeoutMs);
      req.on("error", (err: NodeJS.ErrnoException) => finish({ error: "network_error", detail: err.code ?? "connection_failed" }));
      req.end(request.body);
    });
  },
};

type Outcome = { outcome: AttemptOutcome; statusCode?: number; detail?: string };

async function attempt(url: string, allowLocalhost: boolean, headers: Record<string, string>, body: string): Promise<Outcome> {
  const check = checkWebhookUrl(url, { allowLocalhost });
  if (!check.ok) return { outcome: "invalid_url", detail: check.code };
  let addresses: ResolvedAddress[];
  if (check.insecureLocal) {
    addresses = [{ address: "127.0.0.1", family: 4 }];
  } else {
    try {
      addresses = await transport.resolve(check.hostname);
    } catch (error) {
      return { outcome: "dns_error", detail: (error as NodeJS.ErrnoException).code ?? "lookup_failed" };
    }
    if (!addresses.length) return { outcome: "dns_error", detail: "no_addresses" };
    // Refuse when any answer is internal, so a mixed answer cannot be used to reach the private one.
    if (addresses.some((a) => isBlockedAddress(a.address))) return { outcome: "blocked_address", detail: "private_address" };
  }
  const result = await transport.send({ url: check.url, address: addresses[0], headers, body, timeoutMs: REQUEST_TIMEOUT_MS });
  if ("error" in result) return { outcome: result.error, detail: result.detail };
  if (result.statusCode >= 200 && result.statusCode < 300) return { outcome: "success", statusCode: result.statusCode };
  if (result.statusCode >= 300 && result.statusCode < 400) return { outcome: "redirect", statusCode: result.statusCode, detail: "redirects_not_followed" };
  return { outcome: "http_error", statusCode: result.statusCode };
}

export const deliver = internalAction({
  args: { deliveryId: v.id("webhookDeliveries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.runMutation(internal.webhooks.claimAttempt, { deliveryId: args.deliveryId });
    if (!job) return null;
    const started = Date.now();
    let result: Outcome;
    try {
      const secrets = [];
      for (const c of job.secretCiphertexts) secrets.push(await decryptSecret(c));
      const timestamp = Math.floor(Date.now() / 1000);
      const headers = {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "Chaos-Webhooks/1",
        "Chaos-Event": job.event,
        "Chaos-Delivery": args.deliveryId,
        "Chaos-Attempt": String(job.attempt),
        "Chaos-Signature": await signatureHeader(secrets, timestamp, job.body),
      };
      result = await attempt(job.url, job.allowLocalhost, headers, job.body);
    } catch (error) {
      console.error("webhook delivery failed unexpectedly", args.deliveryId, error);
      result = { outcome: "internal_error" };
    }
    await ctx.runMutation(internal.webhooks.recordAttempt, {
      deliveryId: args.deliveryId, attempt: job.attempt, outcome: result.outcome, statusCode: result.statusCode,
      durationMs: Date.now() - started, detail: result.detail,
    });
    return null;
  },
});
