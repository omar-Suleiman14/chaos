import { WebHaptics } from "web-haptics";

let _instance: WebHaptics | null = null;

function getWebHaptics(): WebHaptics | null {
  if (typeof window === "undefined") return null;
  if (_instance) return _instance;
  _instance = new WebHaptics();
  return _instance;
}

function trigger(type?: Parameters<WebHaptics["trigger"]>[0]) {
  try {
    getWebHaptics()?.trigger(type as never);
  } catch {
    // web-haptics intentionally no-ops on unsupported platforms
  }
}

// Keep a small wrapper API used across the app.
export const haptics = {
  light: () => trigger("light"),
  medium: () => trigger("medium"),
  heavy: () => trigger("heavy"),
  success: () => trigger("success"),
  warning: () => trigger("warning"),
  error: () => trigger("error"),
  select: () => trigger("selection"),
};
