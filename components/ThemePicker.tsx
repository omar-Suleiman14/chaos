"use client";

import { useId, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { ThemePresetId } from "@/convex/formLogic";
import { themePresets } from "@/components/forms/formThemes";
import { useCopy, useLocale } from "@/lib/i18n";
import { ThemePickerStyles } from "./themePickerStyles";

const copy = {
  en: {
    label: "Theme",
    expand: "All themes", collapse: "Fewer themes", search: "Search themes", empty: "No themes match your search.",
    names: {} as Partial<Record<ThemePresetId, string>>,
  },
  ar: {
    label: "المظهر",
    expand: "كل المظاهر", collapse: "مظاهر أقل", search: "ابحث عن مظهر", empty: "لا توجد مظاهر تطابق بحثك.",
    names: {
      "google-forms": "بأسلوب Google Forms", "microsoft-forms": "بأسلوب Microsoft Forms",
      paper: "ورقي", chaos: "أخضر داكن", "soft-grid": "شبكة ناعمة", spotlight: "تسليط الضوء", terracotta: "طيني",
      ocean: "محيط", midnight: "منتصف الليل", garden: "حديقة", neon: "نيون", aurora: "شفق",
      candy: "حلوى", terminal: "طرفية", newsprint: "صحيفة", arcade: "ألعاب", velvet: "مخمل", sunset: "غروب",
    } as Partial<Record<ThemePresetId, string>>,
  },
};

/** A preset's name in the current language. */
export function useThemeName() {
  const t = useCopy(copy);
  return (id: ThemePresetId) => t.names[id] ?? themePresets.find((p) => p.id === id)?.name ?? id;
}

const compactIds: readonly ThemePresetId[] = ["chaos", "terracotta", "ocean", "midnight", "velvet", "arcade"];

interface ThemePickerProps {
  value: ThemePresetId | string | undefined;
  onChange: (id: ThemePresetId) => void;
  label?: string;
  /** Limit or reorder presets; when omitted, all themes are available through expansion. */
  ids?: readonly ThemePresetId[];
  /** An inherited/default choice, e.g. use a quiz's saved theme. */
  defaultOption?: { label: string; onSelect: () => void };
  /** Let an owning surface manage expansion itself (e.g. the landing demo). */
  expandable?: boolean;
  className?: string;
}

/**
 * Compact, named palette choices. All presets remain available through expansion/search.
 * A single radio group supports arrow keys, Home/End and a visible keyboard focus.
 */
export function ThemePicker({ value, onChange, label, ids, defaultOption, expandable = !ids, className = "" }: ThemePickerProps) {
  const t = useCopy(copy);
  const { dir } = useLocale();
  const groupId = useId();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const available = ids ? themePresets.filter((p) => ids.includes(p.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)) : themePresets;
  const compact = compactIds.map((id) => available.find((p) => p.id === id)).filter((p) => p !== undefined);
  const selectedPreset = available.find((p) => p.id === value);
  if (selectedPreset && !compact.some((p) => p.id === selectedPreset.id)) compact.splice(Math.max(0, compact.length - 1), 1, selectedPreset);
  const query = search.trim().toLocaleLowerCase();
  const presets = (expandable && !expanded ? compact : available).filter((p) => !expanded || !query || `${t.names[p.id] ?? p.name} ${p.name}`.toLocaleLowerCase().includes(query));
  const choices = [
    ...(defaultOption ? [{ id: undefined, name: defaultOption.label, preset: undefined }] : []),
    ...presets.map((preset) => ({ id: preset.id, name: t.names[preset.id] ?? preset.name, preset })),
  ];
  const selected = choices.findIndex((p) => p.id === value);
  const tabStop = selected >= 0 ? selected : 0;
  const select = (index: number) => {
    const choice = choices[index];
    if (!choice) return;
    if (choice.id === undefined) defaultOption?.onSelect();
    else onChange(choice.id);
  };

  const move = (from: number, step: number) => {
    if (!choices.length) return;
    const next = (from + step + choices.length) % choices.length;
    refs.current[next]?.focus();
    select(next);
  };
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const rtl = dir === "rtl";
    const map: Record<string, number | "start" | "end"> = {
      ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1, Home: "start", End: "end",
    };
    const action = map[event.key];
    if (action === undefined) return;
    event.preventDefault();
    if (action === "start") move(0, 0);
    else if (action === "end") move(choices.length - 1, 0);
    else move(index, action);
  };

  return (
    <>
    <ThemePickerStyles />
    <div className={`theme-picker ${className}`}>
      {expandable && expanded && <input type="search" className="theme-picker__search" aria-label={t.search} placeholder={t.search} value={search} onChange={(event) => setSearch(event.target.value)} />}
      <div id={groupId} className="theme-picker__choices" role="radiogroup" aria-label={label ?? t.label}>
      {choices.map((choice, index) => {
        const theme = choice.preset?.theme;
        const checked = choice.id === value;
        return (
          <button
            key={choice.id ?? "inherit"}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabStop ? 0 : -1}
            className="theme-picker__item"
            onClick={() => select(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {theme && <span className="theme-picker__palette" aria-hidden="true">{[theme.pageColor, theme.surfaceColor, theme.accent].map((color, i) => <span key={i} style={{ background: color }} />)}</span>}
            <span className="theme-picker__name">{choice.name}</span>
            <Check className="theme-picker__check" size={15} aria-hidden="true" style={{ visibility: checked ? "visible" : "hidden" }} />
          </button>
        );
      })}
      </div>
      {!presets.length && <p className="theme-picker__empty" role="status">{t.empty}</p>}
      {expandable && <button type="button" className="theme-picker__expand" aria-expanded={expanded} aria-controls={groupId} onClick={() => { setExpanded(!expanded); setSearch(""); }}>{expanded ? t.collapse : `${t.expand} (${available.length})`}</button>}
    </div>
    </>
  );
}
