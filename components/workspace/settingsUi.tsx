"use client";

import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";

/* Building blocks shared by Settings (content) and Profile (account and app settings). */

export function Section({ id, icon: Icon, title, description, children }: { id: string; icon: LucideIcon; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="ws-settings-section" aria-labelledby={`section-${id}`}>
      <div className="ws-settings-section__intro">
        <Icon size={20} aria-hidden="true" />
        <div><h2 id={`section-${id}`}>{title}</h2><p>{description}</p></div>
      </div>
      {children}
    </section>
  );
}

export function Row({ id, label, help, isDefault, children, stack }: { id?: string; label: string; help?: React.ReactNode; isDefault?: boolean; children: React.ReactNode; stack?: boolean }) {
  return (
    <div id={id} className={`ws-row ${stack ? "ws-row--stack" : ""}`} data-default={isDefault ? "true" : "false"}>
      <div className="ws-row__text"><span className="ws-row__label">{label}</span>{help && <span className="ws-row__help">{help}</span>}</div>
      <div className="ws-row__control">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="ws-segmented"  aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </fieldset>
  );
}

/** Scrolls to the row named in the address (#settings-glass) and marks it for a moment. Rows can appear after data loads, so it retries briefly. */
export function useScrollToHash(ready: boolean) {
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const row = document.getElementById(id);
      if (!row) { if (tries++ < 20) timer = setTimeout(go, 100); return; }
      row.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      row.setAttribute("data-flash", "true");
      timer = setTimeout(() => row.removeAttribute("data-flash"), 1600);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => { clearTimeout(timer); window.removeEventListener("hashchange", go); };
  }, [ready]);
}
