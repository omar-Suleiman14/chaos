# Chaos - Migration Summary

This app has been migrated from Vite to Next.js with Convex backend.

## Setup Steps

1. **Install dependencies:**
```bash
npm install
```

2. **Initialize Convex:**
```bash
npx convex dev
```

3. **Run development server:**
```bash
npm run dev
```

## What's New

✅ Next.js 15 with App Router
✅ Convex database (replaces localStorage)
✅ shadcn/ui components
✅ Optional timer for quizzes
✅ Dynamic option counts (not limited to 4)
✅ Clean URLs: `/username/quizslug`
✅ Responsive design (mobile-first)
✅ Fixed scroll glow effect
✅ Email/password auth (no Clerk)

## File Structure Changes

- Old: `index.html` + React Router
- New: Next.js App Router with `app/` directory
- Auth: Context-based (`contexts/AuthContext.tsx`)
- Database: Convex (`convex/` directory)
- UI: shadcn (`components/ui/`)

## Key Components (In Progress)

- [x] Landing - Auth and landing page
- [ ] Dashboard - Quiz creation with dynamic options
- [ ] QuizPlayer - Enhanced scroll experience
- [ ] QuizResults - Results display

See README.md for full documentation.
