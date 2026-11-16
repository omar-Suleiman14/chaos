import { scheduleAnalytics } from "@/lib/analytics";

// PostHog loads after analytics consent, outside the first-load bundle; returning visitors load it at idle.
scheduleAnalytics();

// Cache only the public offline fallback for failed navigations (no private data).
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  const registerOfflineFallback = () => {
    void navigator.serviceWorker.register("/push-sw.js", { scope: "/" }).catch(() => {});
  };
  if (document.readyState === "complete") registerOfflineFallback();
  else window.addEventListener("load", registerOfflineFallback, { once: true });
}
