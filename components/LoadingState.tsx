"use client";

import { useEffect, useState } from "react";
import { useCopy } from "@/lib/i18n";
import StateIllustration from "@/components/StateIllustration";

const copy = {
  en: { stalled: "This is taking longer than expected. Check your connection and try again.", retry: "RETRY" },
  ar: { stalled: "استغرق ذلك وقتًا أطول من المتوقع. تحقق من اتصالك وحاول مرة أخرى.", retry: "أعد المحاولة" },
};

interface LoadingStateProps {
  label: string;
  stalledLabel?: string;
  className?: string;
}

export default function LoadingState({
  label,
  stalledLabel,
  className = "py-20",
}: LoadingStateProps) {
  const t = useCopy(copy);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setStalled(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  // Only the stalled state gets a picture: a load still in progress keeps its plain line, and
  // content-shaped skeletons (components/workspace/Skeletons.tsx) are left alone.
  if (stalled) {
    return (
      <div className={`${className} text-center`}>
        <StateIllustration variant="offline" className="mx-auto mb-4 block" />
        <p className="chaos-heading text-sm text-destructive">{stalledLabel ?? t.stalled}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="kb-btn kb-btn-ghost mt-4 text-xs"
        >
          {t.retry}
        </button>
      </div>
    );
  }

  return (
    <div className={`${className} text-center chaos-pulse`}>
      <p className="chaos-heading text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
