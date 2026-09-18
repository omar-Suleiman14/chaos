"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
          <div className="chaos-card bg-card p-8 max-w-lg w-full text-center">
            <p className="chaos-heading text-xs text-destructive mb-3">CHAOS INTERRUPTED</p>
            <h1 className="chaos-display text-4xl mb-3">THE APP HIT A PROBLEM.</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Retry the app. If the problem continues, reload from the home page.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button type="button" onClick={reset} className="kb-btn kb-btn-primary">
                TRY AGAIN
              </button>
              <button type="button" onClick={() => window.location.assign("/")} className="kb-btn kb-btn-ghost">
                GO HOME
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
