# Chaos Quiz App

An interactive quiz platform with stunning design, powered by Next.js and Convex.

## Features

- 🎨 Beautiful, dark-themed UI with glassmorphism
- 📱 Fully responsive design (mobile-first)
- ⚡ Optional timer for quizzes
- 🔢 Dynamic number of options (not limited to 4)
- 📊 Real-time analytics
- 🔐 Simple email/password authentication
- 🌐 Clean URLs: `domain.com/username/quizslug`
- 🎯 Scroll-to-submit quiz experience

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd chaos
```

2. Install dependencies:
```bash
npm install
```

3. Set up Convex:
```bash
npx convex dev
```

This will:
- Create a new Convex project (or link to existing)
- Generate your `.env.local` file with `NEXT_PUBLIC_CONVEX_URL`
- Start the Convex development server

4. (Optional) Add Gemini API key for AI quiz generation:

Add to `.env.local`:
```
GEMINI_API_KEY=your_api_key_here
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
chaos/
├── app/                    # Next.js app directory
│   ├── [username]/[slug]/  # Dynamic quiz routes
│   ├── dashboard/          # Creator dashboard
│   ├── results/            # Quiz results page
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Landing page
├── components/             # React components
│   ├── ui/                 # shadcn/ui components
│   ├── ConvexClientProvider.tsx
│   ├── Dashboard.tsx
│   ├── Landing.tsx
│   ├── QuizPlayer.tsx
│   └── QuizResults.tsx
├── convex/                 # Convex backend
│   ├── schema.ts           # Database schema
│   ├── users.ts            # User mutations/queries
│   ├── quizzes.ts          # Quiz mutations/queries
│   └── attempts.ts         # Attempt mutations/queries
├── contexts/               # React contexts
│   └── AuthContext.tsx     # Authentication context
└── lib/                    # Utilities
    ├── types.ts            # TypeScript types
    └── utils.ts            # Helper functions
```

## Key Features

### Optional Timer
When creating a quiz, you can choose to enable or disable the timer. If disabled, users can take as long as they need.

### Dynamic Options
Add as many options as you want to each question (3, 4, 5, 6, or more).

### Scroll-to-Submit
Users scroll through questions and submit by scrolling to the next question.

### Clean URLs
Share quizzes with URLs like:
```
https://yourdomain.com/username/quiz-slug
```

## Deployment

### Deploy to Vercel

1. Push your code to GitHub

2. Import project in Vercel

3. Add environment variables in Vercel:
   - `NEXT_PUBLIC_CONVEX_URL` (from your Convex dashboard)
   - `GEMINI_API_KEY` (optional)

4. Deploy!

5. Set up Convex production:
```bash
npx convex deploy
```

## Tech Stack

- **Framework**: Next.js 15
- **Database**: Convex
- **UI Components**: shadcn/ui + Radix UI
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Charts**: Recharts
- **AI**: Google Gemini (optional)

## License

MIT - Open Source

## Contributing

This is an open-source project. Contributions are welcome!

---

Built with ❤️ using Next.js and Convex
