// Vercel runs this instead of `build` (package.json "vercel-build").
// Production deploys push the Convex functions first, then build the site against them, so the
// site and backend never go out of step. Needs CONVEX_DEPLOY_KEY (a Convex *production* deploy key)
// in Vercel's Production environment.
//
// Preview deploys get their own backend only with a Convex *preview* deploy key ("preview:…") in
// Vercel's Preview environment: `convex deploy` then creates or updates a per-branch preview
// deployment, seeds a small workspace (scripts/preview-seed.ts) and builds against it. A
// production key is never used for a preview: unreviewed branches must not reach the live backend.
// Without a preview key, previews build the site only.
import { spawnSync } from "node:child_process";

const run = (command) => {
  const { status } = spawnSync(command, { stdio: "inherit", shell: true });
  process.exit(status ?? 1);
};

const key = process.env.CONVEX_DEPLOY_KEY ?? "";
if (process.env.VERCEL_ENV !== "production") {
  if (!key.startsWith("preview:")) run("pnpm build");
  // --cmd runs after the functions are deployed: seed, then build. Granting admin needs the
  // account to have signed in to the preview once, so it may fail on the first build.
  const admin = process.env.PREVIEW_ADMIN_EMAIL ? ` && (pnpm exec convex run admin:grantAdmin '{"email":"${process.env.PREVIEW_ADMIN_EMAIL.replace(/[^a-zA-Z0-9@._+-]/g, "")}"}' --preview-name "$VERCEL_GIT_COMMIT_REF" || true)` : "";
  run(`pnpm exec convex deploy --cmd "pnpm exec tsx scripts/preview-seed.ts && pnpm build" --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL${admin}`);
}
if (!key) {
  console.warn("\n⚠ CONVEX_DEPLOY_KEY is not set: building the site only. Convex functions were NOT deployed.\n" +
    "  Add a Convex production deploy key to Vercel's Production environment to deploy both together.\n");
  run("pnpm build");
}
if (key.startsWith("preview:")) {
  console.error("\n✗ A Convex preview deploy key is set for a production build. Use a production key.\n");
  process.exit(1);
}
run('pnpm exec convex deploy --cmd "pnpm build" --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL');
