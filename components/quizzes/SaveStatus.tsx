"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, LoaderCircle, PenLine, Smartphone } from "lucide-react";
import "./saveStatus.css";

export type SaveState = "saving" | "saved" | "device" | "draft" | "unavailable";

const ICON = { saving: LoaderCircle, saved: Check, device: Smartphone, draft: PenLine, unavailable: AlertTriangle } as const;

/**
 * Where a student's answer is right now, as a quiet capsule: saving, saved, kept on this device
 * while the network is away, or no device backup. "Saved" folds to its tick after a moment so a
 * calm screen stays calm; anything that needs attention keeps its words.
 */
export function SaveStatus({ state, label, className = "" }: { state: SaveState; label: string; className?: string }) {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    setFolded(false);
    if (state !== "saved") return;
    const timer = window.setTimeout(() => setFolded(true), 2400);
    return () => window.clearTimeout(timer);
  }, [state]);
  const Icon = ICON[state];
  return (
    <span role="status" aria-live="polite" className={`save-status ${className}`} data-state={state} data-folded={folded || undefined} title={label}>
      <Icon size={14} strokeWidth={2.4} aria-hidden className="save-status__icon" />
      <span className="save-status__label">{label}</span>
    </span>
  );
}
