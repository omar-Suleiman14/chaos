"use client";
import type { ReaderPrefs } from "@/lib/learn/readerPrefs";

export type SetPrefs = (patch: Partial<ReaderPrefs>) => void;

/** One reading preference as a row of radio chips inside the reading settings menu. */
export function ChoiceChips<K extends keyof ReaderPrefs>({ prefs, setPrefs, name, label, options, values }: {
  prefs: ReaderPrefs; setPrefs: SetPrefs; name: K; label: string; options: Record<string, string>; values?: readonly ReaderPrefs[K][];
}) {
  return (
    <div role="group" aria-label={label} className="lx-reading-menu__group">
      <span className="lx-reading-menu__label">{label}</span>
      <div className="lx-chips">
        {(values ?? (Object.keys(options) as ReaderPrefs[K][])).map((value) => (
          <button key={String(value)} type="button" role="menuitemradio" aria-checked={prefs[name] === value} className="lx-chip" onClick={() => setPrefs({ [name]: value } as Partial<ReaderPrefs>)}><bdi>{options[String(value)]}</bdi></button>
        ))}
      </div>
    </div>
  );
}
