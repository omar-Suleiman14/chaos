"use client";

import { useEffect, useState } from "react";

/** A clock that updates rendered deadlines without reading the clock during render. */
export function useNow(interval = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}
