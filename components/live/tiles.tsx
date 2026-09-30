"use client";

import { Check, X } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { LIVE_SHAPES } from "@/convex/liveLogic";
import type { LiveShape } from "@/convex/liveLogic";

const copy = {
  en: {
    names: { triangle: "Triangle", diamond: "Diamond", circle: "Circle", square: "Square" } as Record<LiveShape, string>,
    correct: "Correct answer", wrong: "Not correct", picked: "Your choice",
    votes: (n: number) => `${n} ${n === 1 ? "answer" : "answers"}`,
  },
  ar: {
    names: { triangle: "مثلث", diamond: "معيّن", circle: "دائرة", square: "مربع" } as Record<LiveShape, string>,
    correct: "الإجابة الصحيحة", wrong: "ليست صحيحة", picked: "اختيارك",
    votes: (n: number) => (n === 1 ? "إجابة واحدة" : n === 2 ? "إجابتان" : n >= 3 && n <= 10 ? `${n} إجابات` : `${n} إجابة`),
  },
};

export function shapeAt(index: number): LiveShape {
  return LIVE_SHAPES[index % LIVE_SHAPES.length];
}

export function useShapeName(): (index: number) => string {
  const t = useCopy(copy);
  return (index) => t.names[shapeAt(index)];
}

export function ShapeIcon({ shape, size = 40, color = "currentColor" }: { shape: LiveShape; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false" data-shape={shape}>
      {shape === "triangle" && <path d="M20 4 L37 35 L3 35 Z" fill={color} />}
      {shape === "diamond" && <path d="M20 2 L38 20 L20 38 L2 20 Z" fill={color} />}
      {shape === "circle" && <circle cx="20" cy="20" r="17" fill={color} />}
      {shape === "square" && <rect x="4" y="4" width="32" height="32" rx="2" fill={color} />}
    </svg>
  );
}

export interface AnswerTileProps {
  index: number;
  label: string;
  /** Readable answers by default; a host may explicitly choose symbols-only phone controls. */
  showLabel?: boolean;
  /** Checkboxes: the tile is a toggle. */
  toggle?: boolean;
  selected?: boolean;
  disabled?: boolean;
  /** After the reveal: whether this option is correct. */
  result?: "correct" | "wrong";
  count?: number;
  size?: "phone" | "host";
  onSelect?: () => void;
}

/** Theme-coloured answer controls with stable symbols for projector matching. */
export function AnswerTile({ index, label, showLabel = true, toggle, selected, disabled, result, count, size = "phone", onSelect }: AnswerTileProps) {
  const t = useCopy(copy);
  const shape = shapeAt(index);
  const name = t.names[shape];
  const extra = [result === "correct" ? t.correct : result === "wrong" ? t.wrong : "", count !== undefined ? t.votes(count) : "", selected && !toggle ? t.picked : ""].filter(Boolean).join(", ");
  const dim = result === "wrong";
  const content = (
    <>
      <span className="live-tile__key" aria-hidden="true">{showLabel && size === "phone" ? index + 1 : <ShapeIcon shape={shape} size={24} />}</span>
      {showLabel && <span className="live-tile__label">{label}</span>}
      {count !== undefined && <span className="live-tile__count" aria-hidden="true">{count}</span>}
      {result === "correct" && <Check className="live-tile__mark" size={size === "host" ? 40 : 32} aria-hidden="true" />}
      {result === "wrong" && size === "host" && <X className="live-tile__mark" size={32} aria-hidden="true" />}
    </>
  );
  const className = `live-tile live-tile--${size}${selected ? " live-tile--selected" : ""}${dim ? " live-tile--dim" : ""}`;
  const accessible = `${name}: ${label}${extra ? ` (${extra})` : ""}`;
  if (!onSelect) {
    return <div className={className} role="listitem" aria-label={accessible} data-shape={shape} data-labelled={showLabel} data-result={result}>{content}</div>;
  }
  return (
    <button
      type="button"
      className={className}
      data-shape={shape}
      data-labelled={showLabel}
      data-result={result}
      aria-label={accessible}
      aria-pressed={toggle ? !!selected : undefined}
      aria-keyshortcuts={String(index + 1)}
      disabled={disabled}
      onClick={onSelect}
    >
      {content}
    </button>
  );
}
