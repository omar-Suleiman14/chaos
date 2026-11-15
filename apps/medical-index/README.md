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
- The page intentionally includes `noindex`; no SEO indexing requested.

## Source boundaries

The site links to original Telegram posts; it does not republish source PDFs. Question classification is best-effort from subject, module, activity and numbering. Missing file indicators are inferred from observed sequences, not a complete official curriculum.
