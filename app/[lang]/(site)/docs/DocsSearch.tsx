"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "@/components/site/SiteLink";
import { Search } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { useDocs } from "@/lib/docs/provider";
import { searchDocs } from "@/lib/docs/search";
import { docsCopy } from "./copy";

/**
 * The docs search field. `global` (the top bar) also answers Ctrl/Cmd+K and "/".
 * `inline` shows the results in the page instead of a floating panel.
 */
export default function DocsSearch({ global = false, inline = false }: { global?: boolean; inline?: boolean }) {
  const t = useCopy(docsCopy);
  const router = useRouter();
  const pathname = usePathname();
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const { entries } = useDocs();
  const results = useMemo(() => searchDocs(entries, query), [entries, query]);
  const showPanel = open && query.trim().length > 0;
  const current = results.length ? Math.min(active, results.length - 1) : -1;

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!global) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest("input, textarea, select, [contenteditable=true]");
      const shortcut = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k";
      if (shortcut || (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey)) {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [global]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    input.current?.blur();
    router.push(href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      if (results.length) setActive((current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length) setActive((current - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      if (current >= 0 && showPanel) { event.preventDefault(); go(results[current].entry.href); }
    } else if (event.key === "Escape") {
      if (showPanel) setOpen(false);
      else { setQuery(""); input.current?.blur(); }
    }
  };

  return (
    <div ref={box} className={`docs-search ${inline ? "docs-search--inline" : ""}`}>
      <label className="docs-search__field">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">{t.searchLabel}</span>
        <input
          ref={input}
          value={query}
          placeholder={t.searchPlaceholder}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && current >= 0 ? `${listId}-${current}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {global && !query && <kbd className="docs-search__hint" aria-hidden="true" dir="ltr">Ctrl K</kbd>}
      </label>
      {showPanel && (
        <ul id={listId} role="listbox" aria-label={t.resultsLabel} className="docs-results site-glass">
          {results.length === 0 && <li className="docs-results__empty" role="presentation">{t.noResults(query.trim())}</li>}
          {results.map((result, index) => (
            <li key={result.entry.href} id={`${listId}-${index}`} role="option" aria-selected={index === current} data-active={index === current}
              onMouseMove={() => setActive(index)}>
              <Link href={result.entry.href} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen(false)}>
                <span className="docs-results__title">{result.entry.title}</span>
                <span className="docs-results__section">{result.entry.section}</span>
                <span className="docs-results__snippet">
                  {result.snippet.map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
