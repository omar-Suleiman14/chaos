"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { IntegrityKind } from "@/convex/examIntegrityModel";

type DeliveryState = "disabled" | "ready" | "sending" | "failed";

/**
 * For a future live authorized player, after visible exam-rule consent.
 * This hook is deliberately not mounted by the synthetic preview player.
 * Browsers cannot guarantee delivery on tab close, OS app switching or offline.
 */
export function useExamIntegrityTelemetry(
  attemptId: Id<"examAttempts"> | null,
  enabled: boolean,
  consented: boolean,
) {
  const record = useMutation(api.examIntegrity.record);
  const [status, setStatus] = useState<DeliveryState>("disabled");

  useEffect(() => {
    if (!attemptId || !enabled || !consented) {
      setStatus("disabled");
      return;
    }
    setStatus("ready");
    let active = true;
    const send = (kind: IntegrityKind) => {
      if (navigator.onLine === false && kind !== "offline") return;
      const eventId = crypto.randomUUID();
      setStatus("sending");
      void record({ attemptId, eventId, kind }).then(() => {
        if (active) setStatus("ready");
      }).catch(() => {
        if (active) setStatus("failed");
      });
    };
    const visibility = () => send(document.visibilityState === "hidden" ? "hidden" : "visible");
    const focus = () => send("focus");
    const blur = () => send("blur");
    const online = () => send("online");
    const offline = () => send("offline");
    const fullscreen = () =>
      send(document.fullscreenElement ? "fullscreen_enter" : "fullscreen_exit");
    const pagehide = () => send("pagehide");
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("fullscreenchange", fullscreen);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("pagehide", pagehide);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("fullscreenchange", fullscreen);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("pagehide", pagehide);
    };
  }, [attemptId, enabled, consented, record]);

  // Delivery status is informational, never evidence of a policy breach.
  return { status };
}
