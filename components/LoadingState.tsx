"use client";

import { useEffect, useState } from "react";

interface LoadingStateProps {
  label: string;
  stalledLabel?: string;
  className?: string;
}

export default function LoadingState({
  label,
  stalledLabel = "This is taking longer than expected. Check your connection and try again.",
  className = "py-20",
}: LoadingStateProps) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setStalled(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  if (stalled) {
    return (
      <div className={`${className} text-center`}>
        <p className="chaos-heading text-sm text-destructive">{stalledLabel}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="kb-btn kb-btn-ghost mt-4 text-xs"
        >
          RETRY
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
