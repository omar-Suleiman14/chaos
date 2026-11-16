"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    MaxPaperHop?: { mount: (host: HTMLElement) => () => void };
  }
}

/** The same optional Paper Hop experience as Max; user content stays untouched. */
export default function ChaosOfflineNotice() {
  const [offline, setOffline] = useState(false);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) setOpen(false);
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let teardown: (() => void) | undefined;
    let loader: HTMLScriptElement | undefined;
    const mount = () => {
      if (alive && gameRef.current && window.MaxPaperHop && !teardown) {
        teardown = window.MaxPaperHop.mount(gameRef.current);
      }
    };
    if (window.MaxPaperHop) mount();
    else {
      loader = document.createElement("script");
      loader.src = "/offline-game.js";
      loader.async = true;
      loader.addEventListener("load", mount);
      document.head.appendChild(loader);
    }
    return () => {
      alive = false;
      teardown?.();
      loader?.remove();
    };
  }, [open]);

  if (!offline) return null;
  return (
    <>
      <div role="status" className="fixed bottom-4 left-1/2 z-[60] flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-xl border border-current/20 bg-neutral-900 px-4 py-3 text-sm text-white shadow-xl dark:bg-neutral-100 dark:text-neutral-900">
        <span>You're offline. Keep unsaved work open.</span>
        <button type="button" className="min-h-11 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" onClick={() => setOpen(true)}>
          Play Paper Hop
        </button>
      </div>
      <dialog ref={dialogRef} onClose={() => setOpen(false)} aria-labelledby="chaos-paper-hop-title" className="m-auto max-h-[90dvh] w-[min(650px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-neutral-400/30 bg-[#f7f7f5] p-6 text-neutral-900 shadow-2xl backdrop:bg-black/65 dark:bg-[#222] dark:text-neutral-100">
        <h2 id="chaos-paper-hop-title" className="text-lg font-semibold">Paper Hop</h2>
        <p className="my-2 text-sm opacity-75">The same offline game as Max. Your page stays open behind this window.</p>
        <div ref={gameRef} />
        <button type="button" className="mt-5 min-h-11 rounded-lg border border-current/30 px-4 py-2 focus-visible:outline-2" onClick={() => setOpen(false)}>
          Back to Chaos
        </button>
      </dialog>
    </>
  );
}
