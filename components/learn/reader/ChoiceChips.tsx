"use client";
import type { CSSProperties, ReactNode } from "react";
import type { ReaderPrefs } from "@/lib/learn/readerPrefs";

export type SetPrefs = (patch: Partial<ReaderPrefs>) => void;

/**
 * A segmented control for the reading menus: one track, with a thumb that slides to the chosen
 * option. Each option is a menu radio item, so the menu's arrow keys still reach every choice.
 */
export function Segmented<V extends string | number>({ label, values, value, render, onChange, optionStyle }: {
  label: string; values: readonly V[]; value: V; render: (value: V) => ReactNode; onChange: (value: V) => void; optionStyle?: (value: V) => CSSProperties | undefined;
}) {
  const index = values.indexOf(value);
  return (
    <div role="group" aria-label={label} className="lx-reading-menu__group">
      <span className="lx-reading-menu__label">{label}</span>
      <div className="lx-seg" data-empty={index < 0 || undefined} style={{ ["--n" as string]: values.length, ["--i" as string]: Math.max(0, index) }}>
        <span className="lx-seg__thumb" aria-hidden />
        {values.map((v) => (
          <button key={String(v)} type="button" role="menuitemradio" aria-checked={v === value} className="lx-chip lx-seg__opt" style={optionStyle?.(v)} onClick={() => onChange(v)}>
            {render(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One reading preference as a segmented control inside the reading settings menus. */
export function ChoiceChips<K extends keyof ReaderPrefs>({ prefs, setPrefs, name, label, options, values, optionStyle }: {
  prefs: ReaderPrefs; setPrefs: SetPrefs; name: K; label: string; options: Record<string, string>; values?: readonly ReaderPrefs[K][];
  optionStyle?: (value: ReaderPrefs[K]) => CSSProperties | undefined;
}) {
  const list = (values ?? Object.keys(options)) as readonly (string | number)[];
  return (
    <Segmented label={label} values={list} value={prefs[name] as string | number}
      render={(v) => <bdi>{options[String(v)]}</bdi>} onChange={(v) => setPrefs({ [name]: v } as Partial<ReaderPrefs>)}
      optionStyle={optionStyle as ((v: string | number) => CSSProperties | undefined) | undefined} />
  );
}
