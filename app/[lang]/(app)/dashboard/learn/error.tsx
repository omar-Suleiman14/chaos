"use client";

import posthog from "@/lib/analytics";
import { useEffect } from "react";
import ErrorScreen from "@/components/site/ErrorScreen";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: { title: "This part of Learn didn't load", body: "Your lessons and notes are safe. Try again, or go back to Learn.", retry: "Try again", home: "Go to Learn" },
  ar: { title: "تعذّر تحميل هذا الجزء من Learn", body: "دروسك وملاحظاتك محفوظة. حاول مرة أخرى، أو ارجع إلى Learn.", retry: "حاول مرة أخرى", home: "اذهب إلى Learn" },
};

/** Inside the workspace shell, so Learn navigation stays usable. */
export default function LearnError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useCopy(copy);
  useEffect(() => { posthog.captureException(error); }, [error]);
  return <ErrorScreen inline title={t.title} body={t.body} primary={{ label: t.retry, onClick: reset }} secondary={{ label: t.home, href: "/dashboard/learn" }} digest={error.digest} />;
}
