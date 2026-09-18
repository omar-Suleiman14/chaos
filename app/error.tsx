"use client";

import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="chaos-card bg-card p-8 max-w-lg w-full text-center">
        <p className="chaos-heading text-xs text-destructive mb-3">SOMETHING WENT WRONG</p>
        <h1 className="chaos-display text-4xl mb-3">WE HIT A PROBLEM.</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {error.message || "This page could not be loaded. Try again, or return home."}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button type="button" onClick={reset} className="kb-btn kb-btn-primary">
            TRY AGAIN
          </button>
          <Link href="/" className="kb-btn kb-btn-ghost">
            GO HOME
          </Link>
        </div>
      </div>
    </main>
  );
}
