import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="chaos-card bg-card p-8 max-w-lg w-full text-center">
        <p className="chaos-heading text-xs text-muted-foreground mb-3">404</p>
        <h1 className="chaos-display text-4xl mb-3">NOT FOUND.</h1>
        <p className="text-sm text-muted-foreground mb-6">
          This page does not exist, or it may no longer be available.
        </p>
        <Link href="/" className="kb-btn kb-btn-primary inline-flex">
          GO HOME
        </Link>
      </div>
    </main>
  );
}
