"use client";

import posthog from "@/lib/analytics";
import { useEffect, useMemo } from "react";
import { themeClass, themeStyle } from "@/components/forms/formThemes";
import { emptyDefinition } from "@/convex/formLogic";
import { useInitialTheme } from "./initial-theme";
import "@/components/forms/formThemes.css";

/**
 * What a respondent sees if a form page crashes: the form's own theme (fetched
 * with the page), no Chaos branding, one way forward. Never shows the error
 * itself; only Next's digest, small, as a reference.
 */
export default function RespondError({ error, onRetry }: { error: Error & { digest?: string }; onRetry: () => void }) {
  const initialTheme = useInitialTheme();
  const def = useMemo(() => {
    const base = emptyDefinition("");
    return initialTheme ? { ...base, theme: initialTheme } : base;
  }, [initialTheme]);

  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <div className={`form-shell min-h-[100dvh] ${themeClass(def)}`} style={themeStyle(def)}>
      <main className="mx-auto w-full max-w-2xl px-5 pt-24 pb-16">
        <div className="form-message">
          <h1 className="form-page-title form-heading">This form didn&apos;t load</h1>
          <p className="form-muted text-lg">Please try again in a moment.</p>
          <div><button type="button" className="form-btn" onClick={onRetry}>Try again</button></div>
          {error.digest && <p className="form-muted select-all text-sm">Reference: {error.digest}</p>}
        </div>
      </main>
    </div>
  );
}
