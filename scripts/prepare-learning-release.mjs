import { spawnSync } from "node:child_process";

// Vercel's existing production deploy key selects the same backend as convex deploy.
// Values travel over stdin and are never included in arguments or build logs.
const cli = "node_modules/convex/bin/main.js";
function convex(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], timeout: 60_000,
  });
  if (result.status !== 0) throw new Error("Learning release operation failed: " + args[0]);
  return result.stdout.trim();
}

if (process.env.VERCEL_ENV !== "production" || !process.env.CONVEX_DEPLOY_KEY || process.env.CONVEX_DEPLOY_KEY.startsWith("preview:"))
  throw new Error("Learning release preparation requires the production deployment context.");

if (process.argv[2] === "configure") {
  const names = ["CHAOS_R2_ACCOUNT_ID", "CHAOS_R2_BUCKET", "CHAOS_R2_ACCESS_KEY_ID", "CHAOS_R2_SECRET_ACCESS_KEY"];
  const entries = names.map(name => [name, process.env[name]?.trim()]);
  if (entries.some(([, value]) => !value)) throw new Error("All four private R2 environment variables are required.");
  for (const [name, value] of entries) convex(["env", "set", name], value);
  console.info("Configured private learning storage on the production backend.");
} else if (process.argv[2] === "backfill") {
  for (const name of ["businessTeams:backfillCourseMemberships", "courseSourceAccess:backfill", "r2MediaCleanup:backfillStorage"])
    convex(["run", name, "{}", "--codegen", "disable", "--typecheck", "disable"]);
  const deadline = Date.now() + 5 * 60_000;
  const query = '({membership: (await ctx.db.query("courseMembershipState").withIndex("by_key", q => q.eq("key", "v2")).unique())?.complete === true, sources: (await ctx.db.query("courseSourceAccessState").first())?.complete === true})';
  for (;;) {
    const state = JSON.parse(convex(["run", "--inline-query", query, "--codegen", "disable", "--typecheck", "disable"]));
    if (state.membership && state.sources) break;
    if (Date.now() >= deadline) throw new Error("Access backfills are incomplete. The frontend build has been stopped.");
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  console.info("Learning access backfills completed before the frontend build.");
} else throw new Error("Choose configure or backfill.");
