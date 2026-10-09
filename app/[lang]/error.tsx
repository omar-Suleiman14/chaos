"use client";

import posthog from "@/lib/analytics";
import { useEffect } from "react";
import ErrorScreen from "@/components/site/ErrorScreen";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: { title: "Something went wrong", body: "This page didn't load. Try again, or go back to the home page.", retry: "Try again", home: "Go home" },
  ar: { title: "حدث خطأ ما", body: "لم يتم تحميل هذه الصفحة. حاول مرة أخرى، أو ارجع إلى الصفحة الرئيسية.", retry: "حاول مرة أخرى", home: "الصفحة الرئيسية" },
};

export default function ErrorPage({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  const t = useCopy(copy);
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <ErrorScreen
      illustration="error"
      title={t.title}
      body={t.body}
      primary={{ label: t.retry, onClick: retry ?? reset }}
      secondary={{ label: t.home, href: "/" }}
      digest={error.digest}
      showStatus
    />
  );
}
