"use client";

import RespondError from "@/components/forms/respond/RespondError";

export default function FormError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  return <RespondError error={error} onRetry={retry ?? reset} />;
}
