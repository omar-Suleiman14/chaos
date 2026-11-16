"use client";

import { useEffect } from "react";

/** Cache only the public offline fallback, never authenticated Chaos data. */
export default function OfflineFallbackRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => { void navigator.serviceWorker.register("/chaos-offline-sw.js", { scope: "/" }).catch(() => {}); };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
