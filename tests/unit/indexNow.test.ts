import { afterEach, describe, expect, it, vi } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import nextConfig from "@/next.config";
import { GET as keyFile } from "@/app/api/indexnow/key/[key]/route";
import { INDEXNOW_ENDPOINT, indexNowBatches, indexNowChanges, indexNowConfig, indexNowKeyValid, indexNowPayload, indexNowUrls, submitIndexNow } from "@/convex/indexNowModel";

const key = "0123456789abcdef0123456789abcdef";
const config = { key, origin: "https://chaos.fail" };

describe("IndexNow configuration", () => {
  it("accepts protocol-valid keys only", () => {
    expect(indexNowKeyValid(key)).toBe(true);
    expect(indexNowKeyValid("short")).toBe(false);
    expect(indexNowKeyValid("has space 12345")).toBe(false);
    expect(indexNowKeyValid("x".repeat(129))).toBe(false);
    expect(indexNowKeyValid(undefined)).toBe(false);
  });

  it("is on only for a valid key and a public HTTPS origin", () => {
    expect(indexNowConfig({ INDEXNOW_KEY: key })).toEqual(config);
    expect(indexNowConfig({ INDEXNOW_KEY: key, CHAOS_APP_URL: "https://chaos.fail/" })).toEqual(config);
    expect(indexNowConfig({})).toBeNull();
    expect(indexNowConfig({ INDEXNOW_KEY: "bad key" })).toBeNull();
    expect(indexNowConfig({ INDEXNOW_KEY: key, CHAOS_APP_URL: "http://localhost:3000" })).toBeNull();
    expect(indexNowConfig({ INDEXNOW_KEY: key, CHAOS_APP_URL: "https://localhost" })).toBeNull();
    expect(indexNowConfig({ INDEXNOW_KEY: key, CHAOS_APP_URL: "https://10.0.0.1" })).toBeNull();
    expect(indexNowConfig({ INDEXNOW_KEY: key, CHAOS_APP_URL: "https://chaos.fail/app" })).toBeNull();
    expect(indexNowConfig({ INDEXNOW_KEY: key, CHAOS_APP_URL: "not a url" })).toBeNull();
  });
});

describe("IndexNow URLs", () => {
  it("keeps deduplicated public chaos.fail URLs and drops everything else", () => {
    expect(indexNowUrls(config.origin, [
      "/learn/abc",
      "https://chaos.fail/learn/abc",
      "/learn/abc#intro",
      "/learn/courses/c1",
      "https://www.chaos.fail/learn/abc",
      "https://evil.example/learn/abc",
      "http://chaos.fail/learn/abc",
      "https://user:pw@chaos.fail/learn/abc",
      "/f/form?edit=token",
      "/dashboard",
      "/dashboard/forms/1",
      "/admin/users",
      "/api/v1/forms",
      "/mcp",
      "/print/quiz",
      "//evil.example/x",
    ])).toEqual(["https://chaos.fail/learn/abc", "https://chaos.fail/learn/courses/c1"]);
  });

  it("does not mistake public paths that share a private prefix", () => {
    expect(indexNowUrls(config.origin, ["/administrator/quiz", "/apiary/quiz"])).toEqual(["https://chaos.fail/administrator/quiz", "https://chaos.fail/apiary/quiz"]);
  });

  it("batches and builds the protocol payload", () => {
    expect(indexNowBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(indexNowPayload(config, ["https://chaos.fail/learn/a"])).toEqual({ host: "chaos.fail", key, keyLocation: `https://chaos.fail/${key}.txt`, urlList: ["https://chaos.fail/learn/a"] });
  });
});

describe("IndexNow change detection", () => {
  const page = (fingerprint: string, path = "/learn/a") => ({ path, fingerprint });
  it("submits publishes, material updates and removals only", () => {
    expect(indexNowChanges(null, page("v1"))).toEqual(["/learn/a"]);
    expect(indexNowChanges(page("v1"), page("v2"))).toEqual(["/learn/a"]);
    expect(indexNowChanges(page("v1"), null)).toEqual(["/learn/a"]);
    expect(indexNowChanges(page("v1"), page("v1"))).toEqual([]);
    expect(indexNowChanges(null, null)).toEqual([]);
    expect(indexNowChanges(page("v1", "/f/old"), page("v1", "/f/new"))).toEqual(["/f/old", "/f/new"]);
  });
});

describe("IndexNow submission", () => {
  it("posts batches to the IndexNow endpoint", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const result = await submitIndexNow(config, ["/learn/a", "/learn/a", "/dashboard"], fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ submitted: 1, failed: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect(JSON.parse(init.body as string)).toEqual(indexNowPayload(config, ["https://chaos.fail/learn/a"]));
  });

  it("never throws when IndexNow is down or rejects the request", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const down = vi.fn(async () => { throw new Error("network down"); });
    await expect(submitIndexNow(config, ["/learn/a"], down as unknown as typeof fetch)).resolves.toEqual({ submitted: 0, failed: 1 });
    const rejected = vi.fn(async () => new Response(null, { status: 403 }));
    await expect(submitIndexNow(config, ["/learn/a"], rejected as unknown as typeof fetch)).resolves.toEqual({ submitted: 0, failed: 1 });
    warn.mockRestore();
  });

  it("sends nothing when no URL survives validation", async () => {
    const fetchImpl = vi.fn();
    await expect(submitIndexNow(config, ["/dashboard", "https://evil.example/x"], fetchImpl as unknown as typeof fetch)).resolves.toEqual({ submitted: 0, failed: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("IndexNow key file and canonical host", () => {
  afterEach(() => vi.unstubAllEnvs());
  const serve = (name: string) => keyFile(new Request(`https://chaos.fail/${name}.txt`), { params: Promise.resolve({ key: name }) });

  it("serves only the configured key", async () => {
    vi.stubEnv("INDEXNOW_KEY", key);
    const response = await serve(key);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe(key);
    expect((await serve("ffffffffffffffffffffffffffffffff")).status).toBe(404);
    vi.stubEnv("INDEXNOW_KEY", "");
    expect((await serve(key)).status).toBe(404);
  });

  it("rewrites /<key>.txt at the site root to the key route", async () => {
    const [rewrite] = (await nextConfig.rewrites!()) as { source: string; destination: string }[];
    expect(rewrite.destination).toBe("/api/indexnow/key/:key");
    const match = getPathMatch(rewrite.source);
    expect(match(`/${key}.txt`)).toEqual({ key });
    expect(match("/robots.txt")).toBe(false);
    expect(match(`/learn/${key}.txt`)).toBe(false);
  });

  it("permanently redirects www.chaos.fail to chaos.fail with a 308", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual({ source: "/:path*", has: [{ type: "host", value: "www.chaos.fail" }], destination: "https://chaos.fail/:path*", permanent: true });
  });
});
