import { sharedCookieDomain } from "./hosts";

export const CONSENT_COOKIE = "chaos-consent";
export const CONSENT_DAYS = 180;
const MAX_AGE = CONSENT_DAYS * 86_400_000;
const EVENT = "chaos-consent-change";
export const SETTINGS_EVENT = "chaos-cookie-settings";
let memory: { analytics: boolean; at: number } | null = null;

/** Necessary preference cookie; optional analytics stays off without an explicit choice. */
export function cookieConsent(): boolean | null {
  if (typeof document === "undefined") return null;
  try {
    const raw = document.cookie.split("; ").find(part => part.startsWith(`${CONSENT_COOKIE}=`))?.split("=")[1];
    if (raw) {
      const [version, choice, at] = decodeURIComponent(raw).split(":");
      const savedAt = Number(at);
      if (version === "1" && (choice === "yes" || choice === "no") && Number.isFinite(savedAt)
        && savedAt <= Date.now() && Date.now() - savedAt < MAX_AGE) return choice === "yes";
      return null;
    }
  } catch { /* A blocked cookie can still leave a choice for this tab. */ }
  return memory && Date.now() - memory.at < MAX_AGE ? memory.analytics : null;
}

export function analyticsAllowed(): boolean {
  if (typeof navigator === "undefined") return false;
  const privacy = navigator as Navigator & { globalPrivacyControl?: boolean };
  return cookieConsent() === true && navigator.doNotTrack !== "1" && !privacy.globalPrivacyControl;
}

export function saveCookieConsent(analytics: boolean) {
  const at = Date.now();
  memory = { analytics, at };
  try {
    const sharedDomain = sharedCookieDomain();
    // Production origins are also configured in previews. Browsers silently
    // reject a cookie for chaos.fail when the current host is a preview URL.
    const host = window.location.hostname;
    const domain = sharedDomain && (host === sharedDomain || host.endsWith(`.${sharedDomain}`)) ? sharedDomain : null;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    if (domain) document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(`1:${analytics ? "yes" : "no"}:${at}`)}; Path=/; Max-Age=${MAX_AGE / 1000}; SameSite=Lax${secure}${domain ? `; Domain=${domain}` : ""}`;
  } catch { /* Choice lasts for this tab if cookies are blocked. */ }
  window.dispatchEvent(new Event(EVENT));
  // Notify other tabs on this origin; the shared cookie carries the actual choice.
  try { localStorage.setItem(EVENT, String(at)); } catch { /* Storage may be blocked. */ }
}

export function subscribeCookieConsent(listener: () => void) {
  const sync = () => { memory = null; listener(); };
  const storage = (event: StorageEvent) => { if (event.key === EVENT || event.key === null) sync(); };
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", storage);
  window.addEventListener("focus", sync);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", storage);
    window.removeEventListener("focus", sync);
  };
}

export function openCookieSettings() { window.dispatchEvent(new Event(SETTINGS_EVENT)); }
