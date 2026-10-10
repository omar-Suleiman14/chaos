"use client";

import posthog from "@/lib/analytics";
import { useEffect } from "react";
import ErrorScreen from "@/components/site/ErrorScreen";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: { title: "This page didn't load", body: "Try again, or go back to your library.", retry: "Try again", library: "Go to library" },
  ar: { title: "تعذّر تحميل هذه الصفحة", body: "حاول مرة أخرى، أو ارجع إلى المكتبة.", retry: "حاول مرة أخرى", library: "اذهب إلى المكتبة" },
};

/** Shown inside the workspace, so the sidebar stays usable. */
export default function DashboardError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  const t = useCopy(copy);
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <ErrorScreen
      inline
      illustration="error"
      title={t.title}
      body={t.body}
      primary={{ label: t.retry, onClick: retry ?? reset }}
      secondary={{ label: t.library, href: "/dashboard" }}
      digest={error.digest}
    />
  );
}
