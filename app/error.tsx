"use client";

import posthog from "@/lib/analytics";
import { useEffect } from "react";
import ErrorScreen from "@/components/site/ErrorScreen";

export default function ErrorPage({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <ErrorScreen
      title="Something went wrong"
      body="This page didn't load. Try again, or go back to the home page."
      primary={{ label: "Try again", onClick: retry ?? reset }}
      secondary={{ label: "Go home", href: "/" }}
      digest={error.digest}
    />
  );
}
