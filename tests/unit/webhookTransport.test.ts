// @vitest-environment node
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { transport } from "@/convex/webhookDelivery";

let port = 0;
const received: { path: string; headers: Record<string, string | string[] | undefined>; body: string }[] = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push({ path: req.url ?? "", headers: req.headers, body });
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "http://169.254.169.254/" });
      res.end();
    } else if (req.url === "/slow") {
      setTimeout(() => res.end("late"), 500);
    } else {
      res.writeHead(200);
      res.end("a body Chaos never stores");
    }
  });
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const send = (path: string, timeoutMs = 2000) =>
  transport.send({
    // The host name is never looked up: the socket goes to the pinned address.
    url: new URL(`http://unresolvable.invalid:${port}${path}`),
    address: { address: "127.0.0.1", family: 4 },
    headers: { "Content-Type": "application/json", "Chaos-Event": "webhook.test" },
    body: '{"ok":true}',
    timeoutMs,
  });

describe("webhook transport", () => {
  it("posts the body to the pinned address with the given headers", async () => {
    expect(await send("/hook")).toEqual({ statusCode: 200 });
    const last = received.at(-1)!;
    expect(last).toMatchObject({ path: "/hook", body: '{"ok":true}' });
    expect(last.headers["chaos-event"]).toBe("webhook.test");
  });

  it("reports redirects without following them", async () => {
    const before = received.length;
    expect(await send("/redirect")).toEqual({ statusCode: 302 });
    expect(received.length).toBe(before + 1);
  });

  it("gives up after the timeout", async () => {
    expect(await send("/slow", 100)).toEqual({ error: "timeout" });
  });
});
