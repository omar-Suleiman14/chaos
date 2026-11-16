"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n";

const strings = {
  en: {
    title: "Push notifications on this device", enable: "Enable push", disable: "Turn off on this device",
    unsupported: "This browser does not support Web Push.", install: "On iPhone or iPad, add Chaos to your Home Screen and open it there to enable push.",
    denied: "Notifications are blocked. Change the permission in your browser or device settings.",
    unavailable: "Push is not yet configured on this Chaos deployment.", ready: "Choose Enable to request permission.",
    active: "Push enabled for your Chaos account on this device.", working: "Updating…",
    failed: "Could not update push. Check your connection, browser settings or device limit.",
  },
  ar: {
    title: "الإشعارات الفورية على هذا الجهاز", enable: "تفعيل الإشعارات", disable: "إيقافها على هذا الجهاز",
    unsupported: "لا يدعم هذا المتصفح الإشعارات الفورية.", install: "على iPhone أو iPad، أضف Chaos إلى الشاشة الرئيسية وافتحه منها لتفعيل الإشعارات.",
    denied: "الإشعارات محظورة. غيّر الإذن من إعدادات المتصفح أو الجهاز.",
    unavailable: "لم تُضبط خدمة الإشعارات لهذا النشر من Chaos بعد.", ready: "اضغط تفعيل لطلب الإذن.",
    active: "الإشعارات مفعلة لحسابك على هذا الجهاز.", working: "جارٍ التحديث…",
    failed: "تعذّر تحديث الإشعارات. راجع الاتصال أو إعدادات المتصفح أو حد الأجهزة.",
  },
};
type Capability = "checking" | "ready" | "unsupported" | "install" | "denied" | "unavailable";

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Permission is requested only after a direct button press (required by iOS). */
export default function PushNotificationControl() {
  const { locale } = useLocale();
  const t = strings[locale === "ar" ? "ar" : "en"];
  const key = process.env.NEXT_PUBLIC_CHAOS_VAPID_PUBLIC_KEY;
  const subscribe = useMutation(api.pushSubscriptions.subscribe);
  const unsubscribe = useMutation(api.pushSubscriptions.unsubscribe);
  const [capability, setCapability] = useState<Capability>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const enabled = useQuery(api.pushSubscriptions.enabledOnDevice, endpoint ? { endpoint } : "skip");

  useEffect(() => {
    let cancelled = false;
    const update = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setCapability("unsupported");
        return;
      }
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (ios && !window.matchMedia("(display-mode: standalone)").matches) {
        if (!cancelled) setCapability("install");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setCapability("denied");
        return;
      }
      if (!key) { if (!cancelled) setCapability("unavailable"); return; }
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const current = await registration?.pushManager.getSubscription();
        if (!cancelled) { setEndpoint(current?.endpoint ?? null); setCapability("ready"); }
      } catch {
        if (!cancelled) setCapability("unsupported");
      }
    };
    void update();
    return () => { cancelled = true; };
  }, [key]);

  const change = async () => {
    if (busy || capability !== "ready") return;
    setBusy(true); setFailed(false);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const current = await registration?.pushManager.getSubscription();
      if (current && enabled) {
        await unsubscribe({ endpoint: current.endpoint });
        await current.unsubscribe();
        setEndpoint(null);
      } else {
        // Keep the permission request in the click's user-activation chain.
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setCapability(permission === "denied" ? "denied" : "ready");
          return;
        }
        const worker = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
        const ready = await navigator.serviceWorker.ready;
        const existing = await ready.pushManager.getSubscription();
        const push = existing ?? await worker.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: applicationServerKey(key!),
        });
        const serialized = push.toJSON();
        if (!serialized.keys?.auth || !serialized.keys?.p256dh) throw new Error("Missing subscription keys");
        await subscribe({
          endpoint: push.endpoint, auth: serialized.keys.auth, p256dh: serialized.keys.p256dh,
          locale: locale === "ar" ? "ar" : "en",
        });
        setEndpoint(push.endpoint);
      }
    } catch { setFailed(true); }
    finally { setBusy(false); }
  };
  const description = capability === "ready" ? enabled ? t.active : t.ready :
    capability === "checking" ? t.working : t[capability];
  return (
    <div className="mt-4 border-t border-foreground/10 pt-3">
      <p className="font-medium">{t.title}</p>
      <output className="mt-1 block text-muted-foreground" aria-live="polite">{failed ? t.failed : description}</output>
      {capability === "ready" && (
        <button type="button" onClick={() => void change()} disabled={busy || (endpoint !== null && enabled === undefined)}
          className="mt-2 rounded-md border border-foreground/20 px-3 py-1.5 text-xs hover:bg-foreground/5 disabled:opacity-50">
          {busy ? t.working : enabled ? t.disable : t.enable}
        </button>
      )}
    </div>
  );
}
