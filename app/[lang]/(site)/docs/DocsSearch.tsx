"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronRight, CornerDownLeft, Search, X } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { useDocs } from "@/lib/docs/provider";
import { searchDocs } from "@/lib/docs/search";
import { useModal } from "@/components/workspace/useModal";
import { Block } from "./DocsViews";
import { docsCopy } from "./copy";

/**
 * The docs search: a button in the sidebar that opens a search popup (also on Ctrl/Cmd+K and "/").
 * Results sit on the left and the highlighted guide previews on the right, as in Quartz and react.dev.
 */
export default function DocsSearch() {
  const t = useCopy(docsCopy);
  const pathname = usePathname();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest("input, textarea, select, [contenteditable=true]");
      const shortcut = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k";
      if (shortcut || (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button ref={trigger} type="button" className="docs-search__field docs-search__trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <Search size={17} aria-hidden="true" />
        <span>{t.searchPlaceholder}</span>
        <kbd className="docs-search__hint" aria-hidden="true" dir="ltr">Ctrl K</kbd>
      </button>
      {open && <SearchDialog onClose={() => setOpen(false)} returnFocus={trigger} />}
    </>
  );
}

function SearchDialog({ onClose, returnFocus }: { onClose: () => void; returnFocus: React.RefObject<HTMLButtonElement | null> }) {
  const t = useCopy(docsCopy);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const panel = useModal<HTMLDivElement>({ onClose, initialFocusRef: input, returnFocusRef: returnFocus });
  const { entries, articles } = useDocs();
  const results = useMemo(() => searchDocs(entries, query), [entries, query]);
  const current = results.length ? Math.min(active, results.length - 1) : -1;
  const selected = current >= 0 ? results[current].entry : null;
  const article = selected ? articles.find((a) => selected.href.split("#")[0] === `/docs/${a.slug}`) : undefined;
  const typed = query.trim().length > 0;

  const go = (href: string) => { onClose(); router.push(href); };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") { event.preventDefault(); if (results.length) setActive((current + 1) % results.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); if (results.length) setActive((current - 1 + results.length) % results.length); }
    else if (event.key === "Enter" && selected) { event.preventDefault(); go(selected.href); }
  };
  // Keep the highlighted result in view while moving with the keyboard.
  useEffect(() => { document.getElementById(`${listId}-${current}`)?.scrollIntoView?.({ block: "nearest" }); }, [current, listId]);

  return (
    <div className="docs-searchbox__overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className="docs-searchbox site-glass" role="dialog" aria-modal="true" aria-label={t.searchLabel} tabIndex={-1}>
        <div className="docs-searchbox__field">
          <Search size={18} aria-hidden="true" />
          <input ref={input} value={query} placeholder={t.searchPlaceholder} aria-label={t.searchLabel} role="combobox" aria-expanded={typed} aria-controls={listId}
            aria-autocomplete="list" aria-activedescendant={current >= 0 ? `${listId}-${current}` : undefined}
            autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
            onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown} />
          <button type="button" className="docs-searchbox__close" aria-label={t.close} onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </div>
        {typed && (
          <div className="docs-searchbox__body">
            <ul id={listId} role="listbox" aria-label={t.resultsLabel} className="docs-searchbox__results">
              {results.length === 0 && <li className="docs-searchbox__empty" role="presentation"><strong>{t.noResultsTitle}</strong><span>{t.noResults(query.trim())}</span></li>}
              {results.map((result, index) => (
                <li key={result.entry.href} id={`${listId}-${index}`} role="option" aria-selected={index === current} data-active={index === current}
                  onMouseMove={() => setActive(index)} onClick={() => go(result.entry.href)}>
                  <span className="docs-results__title">{result.entry.title}</span>
                  <span className="docs-results__section">{result.entry.section}</span>
                  <span className="docs-results__snippet">{result.snippet.map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}</span>
                </li>
              ))}
            </ul>
            {article && selected && (
              <article className="docs-searchbox__preview docs-article" aria-label={t.preview}>
                <p className="docs-searchbox__crumbs"><span>{t.docs}</span><ChevronRight size={14} aria-hidden="true" /><span>{selected.section}</span><ChevronRight size={14} aria-hidden="true" /><span>{article.title}</span></p>
                <h2 className="docs-searchbox__title">{article.title}</h2>
                <p className="docs-summary">{article.summary}</p>
                {article.blocks.slice(0, 8).map((block, i) => <Block key={i} block={block} />)}
              </article>
            )}
          </div>
        )}
        <div className="docs-searchbox__footer" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd></span><span><kbd><CornerDownLeft size={11} /></kbd></span><span><kbd>Esc</kbd></span></div>
      </div>
    </div>
  );
}
