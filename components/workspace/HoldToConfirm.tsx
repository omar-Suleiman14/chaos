"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

/** Press and hold (pointer), or Enter/Space (keyboard) in an already-open confirmation dialog. */
export default function HoldToConfirm({ label, onConfirm, disabled = false, duration = 1_400 }: {
  label: string; onConfirm: () => void; disabled?: boolean; duration?: number;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const [holding, setHolding] = useState(false);
  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  return (
    <button type="button" className="ws-btn ws-btn--danger ws-hold-confirm" disabled={disabled}
      data-holding={holding || undefined} style={{ "--hold-duration": `${duration}ms` } as React.CSSProperties}
      aria-label={label}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        fired.current = false;
        stop();
        event.currentTarget.setPointerCapture(event.pointerId);
        setHolding(true);
        timer.current = setTimeout(() => { fired.current = true; stop(); onConfirm(); }, duration);
      }}
      onPointerMove={(event) => {
        if (!holding) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left - 8 || event.clientX > rect.right + 8 || event.clientY < rect.top - 8 || event.clientY > rect.bottom + 8) stop();
      }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop}
      onKeyDown={(event) => {
        if (!disabled && !event.repeat && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); if (!fired.current) { fired.current = true; onConfirm(); } }
      }}
      onKeyUp={() => { fired.current = false; }}>
      <span className="ws-hold-confirm__fill" aria-hidden="true" />
      <span className="ws-hold-confirm__content"><Trash2 size={14} aria-hidden="true" /> {label}</span>
    </button>
  );
}
