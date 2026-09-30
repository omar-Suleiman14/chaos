"use client";

import { useEffect, useState } from "react";

const QUERY = "(max-width: 640px)";

/** True on phone-sized screens, so screens can make phone-first choices (full-screen previews, icon buttons). */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const update = () => setPhone(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return phone;
}
