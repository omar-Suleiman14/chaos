import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";

vi.mock("node:child_process", () => { const spawnSync = vi.fn(); return { spawnSync, default: { spawnSync } }; });
const originalArgv = process.argv;
const names = ["CHAOS_R2_ACCOUNT_ID", "CHAOS_R2_BUCKET", "CHAOS_R2_ACCESS_KEY_ID", "CHAOS_R2_SECRET_ACCESS_KEY"];
const modulePath = "../../scripts/prepare-learning-release.mjs";
beforeEach(() => {
  vi.resetModules();
  vi.mocked(spawnSync).mockReset();
  vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '{"membership":true,"sources":true}', stderr: "", pid: 1, output: [], signal: null });
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("CONVEX_DEPLOY_KEY", "production-unit-context");
  for (const name of names) vi.stubEnv(name, " unit-input ");
});
afterEach(() => { process.argv = originalArgv; vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("refuses incomplete storage configuration before changing the backend", async () => {
  process.argv = ["node", "prepare", "configure"];
  vi.stubEnv(names[3], "");
  await expect(import(modulePath)).rejects.toThrow("All four");
  expect(spawnSync).not.toHaveBeenCalled();
});

it("passes storage credentials only through stdin", async () => {
  process.argv = ["node", "prepare", "configure"];
  await import(modulePath);
  expect(spawnSync).toHaveBeenCalledTimes(4);
  for (const [, args, options] of vi.mocked(spawnSync).mock.calls) {
    expect(args).not.toContain("unit-input");
    expect(options).toMatchObject({ input: "unit-input", stdio: ["pipe", "pipe", "pipe"] });
  }
});

it("waits for both access projections after scheduling the backfills", async () => {
  process.argv = ["node", "prepare", "backfill"];
  await import(modulePath);
  const calls = vi.mocked(spawnSync).mock.calls.map(([, args]) => args);
  expect(calls.slice(0, 3).map(args => args?.[2])).toEqual([
    "businessTeams:backfillCourseMemberships", "courseSourceAccess:backfill", "r2MediaCleanup:backfillStorage",
  ]);
  expect(calls[3]).toContain("--inline-query");
});
