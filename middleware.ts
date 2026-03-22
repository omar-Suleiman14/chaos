import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/server"]);

export default clerkMiddleware(async (auth, req) => {
  // Standard protected routes (dashboard auth is handled by the dashboard layout)
  if (isProtectedRoute(req)) await auth.protect();
  // Note: /admin access control is handled client-side inside app/admin/page.tsx
  // using useUser().primaryEmailAddress — no middleware redirect needed.
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
