"use client";

import { useEffect, useState } from "react";
import { useConvexConnectionState } from "convex/react";

export default function ConnectivityBanner() {
  const connection = useConvexConnectionState();
  const [showDisconnected, setShowDisconnected] = useState(false);

  useEffect(() => {
    if (connection.isWebSocketConnected) {
      setShowDisconnected(false);
      return;
    }

    const timeout = window.setTimeout(() => setShowDisconnected(true), 1500);
    return () => window.clearTimeout(timeout);
  }, [connection.isWebSocketConnected]);

  if (!showDisconnected || connection.isWebSocketConnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] border-b-2 border-destructive bg-destructive text-on-error px-4 py-2 text-center text-xs font-semibold chaos-heading"
    >
      {connection.hasEverConnected
        ? "CONNECTION LOST — RECONNECTING…"
        : "CONNECTING TO CHAOS…"}
    </div>
  );
}
