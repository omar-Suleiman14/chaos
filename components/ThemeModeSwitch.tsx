"use client";

import { useRef } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemeMode } from "@/components/ThemeProvider";
import { useCopy } from "@/lib/i18n";
import { ThemePickerStyles } from "./themePickerStyles";

const copy = {
  en: { group: "Appearance", system: "System", light: "Light", dark: "Dark" },
  ar: { group: "المظهر", system: "النظام", light: "فاتح", dark: "داكن" },
};

/** System, Light or Dark. Icon buttons by default; pass showLabels for a roomier row (App Settings). */
export function ThemeModeSwitch({ showLabels = false, className = "" }: { showLabels?: boolean; className?: string }) {
  const { mode, setMode } = useTheme();
  const t = useCopy(copy);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const options: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
    { id: "system", label: t.system, Icon: Monitor },
    { id: "light", label: t.light, Icon: Sun },
    { id: "dark", label: t.dark, Icon: Moon },
  ];
  const index = options.findIndex((o) => o.id === mode);
  const onKeyDown = (event: React.KeyboardEvent, from: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (from + step + options.length) % options.length;
    refs.current[next]?.focus();
    setMode(options[next].id);
  };
  return (
    <>
    <ThemePickerStyles />
    <div className={`mode-switch ${className}`} role="radiogroup" aria-label={t.group}>
      {options.map(({ id, label, Icon }, i) => (
        <button key={id} ref={(node) => { refs.current[i] = node; }} type="button" role="radio" aria-checked={mode === id}
          aria-label={showLabels ? undefined : label} title={label} tabIndex={i === (index < 0 ? 0 : index) ? 0 : -1}
          onClick={() => setMode(id)} onKeyDown={(event) => onKeyDown(event, i)}>
          <Icon size={16} aria-hidden="true" />{showLabels && <span>{label}</span>}
        </button>
      ))}
    </div>
    </>
  );
}
