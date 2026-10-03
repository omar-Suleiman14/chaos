// Vercel runs this instead of `build` (package.json "vercel-build").
// Production deploys push the Convex functions first, then build the site against them, so the
// site and backend never go out of step. Needs CONVEX_DEPLOY_KEY (a Convex *production* deploy key)
// in Vercel's Production environment. Preview deploys only build the site: a production key must
// never deploy unreviewed branches to the live backend.
import { spawnSync } from "node:child_process";

const run = (command) => {
  const { status } = spawnSync(command, { stdio: "inherit", shell: true });
  process.exit(status ?? 1);
};

if (process.env.VERCEL_ENV !== "production") run("pnpm build");
if (!process.env.CONVEX_DEPLOY_KEY) {
  console.warn("\n⚠ CONVEX_DEPLOY_KEY is not set: building the site only. Convex functions were NOT deployed.\n" +
    "  Add a Convex production deploy key to Vercel's Production environment to deploy both together.\n");
  run("pnpm build");
}
run('pnpm exec convex deploy --cmd "pnpm build" --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL');
