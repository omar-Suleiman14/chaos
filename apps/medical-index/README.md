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
