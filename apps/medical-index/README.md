# Chaos Index

The standalone, static medical study index available at **https://index.chaos.fail**.

This is part of the Chaos GitHub repository, but it is **independently hosted on Vercel** and does not modify Chaos's Next.js app or Convex backend.

## Contents

- `index.html`: self-contained HTML, responsive layout, CSS, JavaScript and a snapshot of 1,173 original Telegram file-post links across 18 medical modules.
- `questions.json`: curated index of 471 lecture-specific and other question-set posts in Medics 44 MCQ. Source post titles and Telegram message IDs are included for review and future updates.
- `vercel.json`: static deployment configuration.

## User experience

- One-page nested accordions (year → module → subject → materials).
- New visitors see years collapsed; choices are saved in browser localStorage.
- Expand all / Collapse all, instant keyword search and material-type filters.
- Light/dark mode and restrained Chaos/Notion-inspired muted subject colors.
- “Questions” links appear beside matching lecture, tutorial, practical or CBL material. Additional confirmed question sets appear under their corresponding subject.
- Source PDF links and practice question links point to the original Telegram messages. Some lecture quiz posts introduce a thread or sequence of later questions; they are not standalone question PDFs.
- Missing file numbers are inferred from observed sequences, not from an official academic checklist.

## Source boundaries

This index does **not** host or duplicate lecture PDFs or question content. It provides hyperlinks to Telegram posts in the channels **@zatooona44** and **@medics_44_mcq**. Posts can require Telegram access, be edited, or become unavailable.

Question-set classification is a best-effort match using module tags, subject, activity type, and numbering; it has not been manually verified for every course file. Do not infer that every lecture has a quiz if no match appears.

## Deployment

The current Vercel project is `med-module-library` (custom domain `index.chaos.fail`). The site was originally deployed from standalone source uploads. Adding these files to the Chaos repository **does not itself switch the Vercel project to Git auto-deployment**; configure the project's Root Directory to `apps/medical-index` if you later connect this repository to the standalone Vercel project.

The `<meta name="robots" content="noindex">` tag prevents intentional public-search indexing, as requested.

No analytics, third-party UI libraries, or server-side accounts are used by this page. User preferences remain in localStorage.
