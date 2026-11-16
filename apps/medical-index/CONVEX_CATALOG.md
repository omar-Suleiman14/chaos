# Chaos Index — Live Convex catalogue

The catalogue was originally embedded in index.html and questions.json, so a content change forced a new Vercel deployment. This bridge overlays Convex records on the bundled catalogue without changing the UI, report flow, or offline fallback.

## Initial production rollout

1. Deploy the new Convex schema/functions and the Chaos web API GET /api/index-catalog. This step does require a normal production backend release.
2. Make sure the GitHub Actions secret CONVEX_DEPLOY_KEY is a **production-scoped deploy key** for the correct Chaos deployment. Never put it in this repo, the static site, the Telegram updater prompt, or a public browser.
3. Run the "Sync Chaos Index content (Convex)" workflow **manually** with seed=true. It imports D + Q from index.html in batches and does not replace any later edited records.
4. Perform one production-only deployment of the standalone Index. Verify the browser can read https://chaos.fail/api/index-catalog and render the updated content on https://index.chaos.fail.
5. Run the same workflow normally (seed=false) to apply catalog-updates.json, or merge a content-only change to that file on main. Changes are idempotent by (source, messageId), and the workflow does **not** rebuild the static site.

An administrator with an authenticated Convex client may also call api.indexCatalog.upsert. No anonymous public writes exist. The public endpoint only reads Telegram references. Pages poll while visible every 60 seconds and refresh when they regain focus. Network or backend failure preserves the last rendered static/online catalogue.

## Scheduled updater

Once the initial rollout and workflow credential are verified, the ChatGPT morning/evening tasks should edit **only** catalog-updates.json for verified changed Telegram source messages. Merge content-only updates through normal repository protections; the new workflow syncs them into Convex with no Vercel deploy required. Keep original message IDs, category, year/module and file names. Do not fabricate links or remove unrelated records.

## Current limits

- Module definitions M are still static, as are the bundled fallback D/Q arrays. A later migration can remove the legacy copies only after database parity and offline recovery are verified.
- Existing build-time share pages, sitemap and PNG previews remain tied to bundled data. They do **not** automatically include new Convex records; dynamic server-side SEO/OG routes must be added before claiming complete no-deploy SEO. Do not remove the old generated pages before that work is finished.
- This PR does not connect a privileged write tool to the existing ChatGPT Chaos MCP app; GitHub Actions plus a production Convex deploy key is the intended write transport for the current scheduler.
- This PR alone is not evidence of Convex production deployment or Vercel publication.
