# Chaos Index

Standalone medical study index at **https://index.chaos.fail**, owned alongside the Chaos repository.

## Data and interface

- **18 modules**, **1,173 original ZatoOona Telegram file links**, **471 Medics 44 MCQ question-set links**.
- Hierarchy: Year → Module → Study / Practical / Other → Subject → original file and question links.
- Study contains lectures, tutorials, and CBLs; Practical contains practical materials; Other contains exams, timetables, revision and other resources.
- Subject-based muted card colors, pure-black dark theme, optional light theme, module tab transitions.
- Search traverses all tabs and opens a matching module. The UI remembers each selected module tab and accordion state in `localStorage`.

## Missing-material reports

- Fixed bottom-right button opens a responsive report drawer.
- Year, module, and item type are preselected from the active module/tab, and may be changed.
- A public Chaos form collects the subject, lecture/item number, description, and optional source link.
- The report form has these **required hidden URL parameters** (captured securely with each response): `index_year`, `index_module`, and `index_type`. Optional: `index_source`. Do not construct a direct share URL without these parameters.
- Backend storage uses Chaos's **existing Convex form-response tables**; no new database deployment or API token is required.
- Form ID: `form_m973nb8tnjsxf50thb2cjrkndx8j99r3`. Public share ID: `ubkfqijk2w`.
- Private report inbox: `https://chaos.fail/dashboard/forms/m973nb8tnjsxf50thb2cjrkndx8j99r3/responses`.
- `/admin` is an entry page linking to the Chaos report inbox. **Chaos authentication and the form's owner permissions protect actual report data.** Do not implement an email-string check in client JavaScript.
- Responses can be read via the connected Chaos MCP using `list_responses` for the form ID. Parsed hidden URL parameters provide the report's year, module, and material type.
- Existing Chaos in-app `notifyOnResponse` is enabled. **True iPhone background push is not yet connected**; it would require an authenticated, owner-only Web Push subscription endpoint, secure VAPID private key, and server-side push dispatch. Do not claim background push is active.

## Install as PWA

- `manifest.webmanifest` defines a standalone `Chaos Index` app at `/`.
- `icon.svg` supplies a maskable web app icon. `sw.js` caches only the index app shell and static icons, never responses, authentication, or third-party forms.
- On iOS Safari, open `https://index.chaos.fail`, tap **Share → Add to Home Screen → Add**.
- `/admin` opens a Chaos sign-in protected dashboard link. Installing the PWA is not itself proof of admin access.

## Updating and deploying

- The canonical source is `apps/medical-index` in `omar-Suleiman14/chaos`.
- `questions.json` lists indexed question posts. The site's file and question catalogue is currently embedded in `index.html`.
- Legacy Vercel project `med-module-library` currently hosts the custom domain through source-upload deployments; its Git integration should be completed separately from the Chaos Next.js app. Merging the index-only pull request does not automatically connect the legacy project.
- Daily Telegram updater runs every day, including weekends, checking verified source posts and preserving existing material.
- Public catalogue, module, material and question pages are indexable; the admin, offline and error pages remain `noindex`. The production build owns generated SEO metadata and crawlable pages.

## Source boundaries

The site links to original Telegram posts; it does not republish source PDFs. Question classification is best-effort from subject, module, activity and numbering. Missing file indicators are inferred from observed sequences, not a complete official curriculum.

## Native missing-material reporting (November 2026)

The index no longer embeds a Chaos form or uses native HTML `select` controls. The fixed **Report missing** button opens a native index dialog, presented as a bottom sheet on phones. Its custom pickers ask for **Year → Module → Type**, followed by one notes field and Submit. Current module and material type are preselected. Inferred gaps have their own inline **Report missing** buttons, preselecting the relevant number and subject.

Submission uses `POST https://chaos.fail/api/index-report` (implemented at `app/api/index-report/route.ts` in the Chaos Next.js app). That endpoint validates origin, year/module compatibility, material type, note length, and an idempotent submission key. The route uses the existing **Convex-backed Chaos form response store as internal storage only**, with no embedded Chaos form UI. Responses are still owner-private in Chaos and accessible through `mcp__Chaos__list_responses` using `form_m973nb8tnjsxf50thb2cjrkndx8j99r3`. Auth and report access remain protected by Chaos. In-app owner notifications are enabled; **native iPhone push notifications have not been configured**.

The report endpoint requires `NEXT_PUBLIC_CONVEX_URL` on the Chaos web deployment and the already published internal report form. The standalone index project needs no Convex credentials. Do not ship the native UI until the endpoint has been deployed successfully.

## Study-material gap audit

See [MISSING_STUDY_MATERIALS.md](MISSING_STUDY_MATERIALS.md). Only **lectures, tutorials, and CBLs** are audited; practicals are out of scope. Multi-lecture PDFs, Arabic numerals and incorrectly categorized study files are reconciled before inferring a missing numbered item. An inferred missing item is a request for verification, not a statement that the curriculum definitely contains that lecture.

### Additional verified file source

Biochemistry Tutorial 07 is linked from [ZatoOona 46 message 259](https://t.me/ZatOona46/259), with its original channel preserved rather than rewriting it as a ZatoOona 44 URL. This adds one verified PDF message link (1,174 total); Pharmacology Lecture 15 remains unresolved and was intentionally left untouched.


## Neutral hierarchy guides and material ordering (Nov 16, 2026)

The index uses a VS Code-style tree: parent Year rows connect by vertical and horizontal guides to Modules, which connect independently to tabs and Subjects. **Year and module hierarchy accents are grayscale only**, with shared light/dark neutral tokens (`--hierarchy-year` and `--hierarchy-module`). There are no year-specific or module-specific palettes. Year and module labels use normal text colors; their chevrons use the muted neutral text token. Keep hierarchy connector lines and indentation visible, including in RTL and on mobile.

**Do not grayscale the subject or material colors.** Subject identifiers and lecture, tutorial, CBL, practical, exam, question, and resource card styles retain their existing colors. The daily updater must not reintroduce colored year/module palettes.

Accordion panels animate both ways, and the custom report menu opens and closes with motion while honoring `prefers-reduced-motion`. Study / Practical / Other tab switches now reconcile subjects by name rather than fading the whole content panel: unchanged subject headings stay mounted and visible, and only changed material groups or newly appearing subjects animate. Rapid switches apply immediately, preventing stale exit animations from hiding the selected tab. Within a subject, display **Lectures → unmatched Questions → remaining material**; matched questions stay linked inline to their verified lecture/tutorial. The report Type selector starts with **Lecture → Questions → other types**. Material rows retain a fixed 56px height with ellipsized labels.

**Git deployments:** The Vercel `med-module-library` project's root directory is `apps/medical-index`, so Git deployments should publish the standalone static Index rather than attempting to build the root Chaos Next.js application. Keep `vercel.json` in this root and verify the live alias `index.chaos.fail` after any deployment.


## Visitor analytics (PostHog)

Index uses Chaos's existing EU PostHog project for anonymous, aggregated traffic measurement. The private dashboard is [Chaos Index Analytics](https://eu.posthog.com/project/287854/dashboard/1118981); the `/admin` landing links there but **does not embed or expose visitor records**. PostHog sign-in governs dashboard access.

The standalone static site is built by `node build.mjs` (Vercel root `apps/medical-index`, output `dist`). Configure these optional Vercel **production** environment variables:

- `INDEX_POSTHOG_PROJECT_TOKEN` — public, client-side PostHog project token.
- `INDEX_POSTHOG_HOST` — the matching EU/US ingestion host.

The build generates `dist/analytics-config.js`. Do not commit this generated file, hardcode a token, or use a private PostHog personal API key in browser code. If configuration is missing the site still works, with analytics disabled.

`index-analytics.js` loads the official HTML snippet, records pageviews/sessions and coarse year/module/tab/source-link interactions, and listens for the custom `index:report-submitted` event after the report API accepts a submission. **Never track report descriptions, search text, student identities, raw Telegram URLs or form fields.** Automatic element capture, session recording and surveys are disabled; Do Not Track is respected. Anonymized IP processing is configured in the PostHog project.

Charts use `$pageview` scoped to URLs containing `index.chaos.fail`: unique visitors, pageviews, visits, countries, devices and referrers. Counts only begin once the new build is live and event collection succeeds; they cannot reconstruct earlier traffic.

## Accessibility, SEO and recovery (Nov 16, 2026)

- The Index provides a skip link, a semantic page heading, focusable native buttons and links, keyboard-operable accordion/tab/report interactions, visible focus styles, reduced-motion support and a screen-reader announcement when connectivity is lost. Continue checking actual keyboard/screen-reader behavior when changing the UI; this list is not a WCAG certification.
- `node build.mjs` runs `seo-build.mjs`. The build reads the existing `M`, `D` and `Q` catalogue arrays in `index.html`; **no second manually maintained link database** is needed. Each new verified resource/question post gets a stable `/material/...` or `/questions/...` share page, and modules get `/module/...` pages. Those server-readable pages include canonical URLs, Open Graph/Twitter metadata, 1200×630 PNG previews, breadcrumbs, descriptive source links, and JSON-LD. The generated `robots.txt` and `sitemap.xml` include these pages automatically. Do not create fabricated Telegram links or manually edit generated `dist` output.
- The original Telegram material action remains a direct source link. The separate **Share** action opens a crawlable Index share link (or the system share sheet on compatible browsers). These previews are metadata for **Index links**; they do not change thumbnails on Telegram itself.
- `404.html` is the friendly missing-page response; `500.html` is a fallback error page. `/offline` is served from `offline.html` and contains an original keyboard/touch-friendly runner. `sw.js` caches only the public shell and recovery/game files for network failure, and never caches reports, authentication, private content or third-party resources. The main Chaos site registers a separate navigation-fallback service worker, caching only its own `/offline.html` and `/offline-game.js`.
- The index's game is an original accessible runner; matching a distinct Max-game implementation would require finding its exact source in Max.
- `.github/workflows/index-seo.yml` runs the standalone build and `seo-audit.mjs`, checking the sitemap's catalogue coverage, metadata, standard error pages, and PNG signatures/sizes. It is intentionally independent from the main Chaos Next.js build.
- Before release, verify `https://index.chaos.fail/robots.txt`, `/sitemap.xml`, `/og/index.png`, a `/module/...` link, a `/material/...` link, and a missing route; confirm the custom domain is assigned to the latest READY production deployment. A Git merge is not sufficient evidence of a successful Vercel deployment.
