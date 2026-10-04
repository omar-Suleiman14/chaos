"use client";

import { useEffect, useState } from "react";
import { ListTree } from "lucide-react";
import type { OutlineItem } from "@/lib/learn/doc";
import { useCopy } from "@/lib/i18n";

const copy = { en: { title: "On this page", nav: "Lesson outline" }, ar: { title: "في هذه الصفحة", nav: "مخطط الدرس" } };

/** The heading currently being read: the last one above a line a third of the way down the screen. */
export function useActiveHeading(items: OutlineItem[]): string | undefined {
  const [active, setActive] = useState<string>();
  useEffect(() => {
    if (!items.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let current: string | undefined = items[0]?.id;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= line) current = item.id;
      }
      setActive(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, [items]);
  return active;
}

export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("reduce-motion");
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
  // Move focus for keyboard and screen-reader users without scrolling again.
  el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  el.dataset.flash = "true";
  setTimeout(() => { delete el.dataset.flash; }, 1600);
}

export function OutlineNav({ items, active, onNavigate }: { items: OutlineItem[]; active?: string; onNavigate?: () => void }) {
  const t = useCopy(copy);
  if (!items.length) return null;
  return (
    <nav className="lx-toc" aria-label={t.nav}>
      {items.map((item) => (
        <a key={item.id} dir="auto" href={`#${item.id}`} data-level={item.level} aria-current={active === item.id ? "location" : undefined}
          onClick={(e) => { e.preventDefault(); jumpTo(item.id); onNavigate?.(); }}>
          {item.text}
        </a>
      ))}
    </nav>
  );
}

export function Outline({ items, active }: { items: OutlineItem[]; active?: string }) {
  const t = useCopy(copy);
  if (!items.length) return null;
  return (
    <div>
      <p className="lx-toc__title">{t.title}</p>
      <OutlineNav items={items} active={active} />
    </div>
  );
}

/** Phones and tablets: the same outline, folded above the lesson. */
export function MobileOutline({ items, active }: { items: OutlineItem[]; active?: string }) {
  const t = useCopy(copy);
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const current = items.find((i) => i.id === active);
  return (
    <details className="lx-toc-mobile" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><ListTree size={16} aria-hidden /> <span>{t.title}</span>{current && <span dir="auto" className="lx-muted" style={{ marginInlineStart: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "55%" }}>{current.text}</span>}</summary>
      <OutlineNav items={items} active={active} onNavigate={() => setOpen(false)} />
    </details>
  );
}
