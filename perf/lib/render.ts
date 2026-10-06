import { act, type RenderResult } from "@testing-library/react";
import type { ProfilerOnRenderCallback } from "react";

/**
 * Deterministic client-side work counters: React commits (via <Profiler>)
 * and DOM mutations (via MutationObserver). Timings in jsdom are not
 * meaningful; counts are, and they regress exactly when work regresses.
 */
export function commitCounter() {
  const commits: { id: string; phase: string }[] = [];
  const onRender: ProfilerOnRenderCallback = (id, phase) => { commits.push({ id, phase }); };
  return { onRender, reset: () => { commits.length = 0; }, get count() { return commits.length; }, get mounts() { return commits.filter((c) => c.phase === "mount").length; } };
}

export type DomWork = { elementsAdded: number; elementsRemoved: number; attributeChanges: number; textChanges: number };

const elements = (nodes: NodeList) => {
  let n = 0;
  for (const node of nodes) if (node.nodeType === 1) n += 1 + (node as Element).getElementsByTagName("*").length;
  return n;
};

/** Runs `fn` inside act() and counts the DOM work it caused under `root`. */
export async function measureDom(root: Node, fn: () => void | Promise<void>): Promise<DomWork> {
  // act() flushes microtasks, which delivers records to the callback; keep those and any still queued.
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((batch) => { records.push(...batch); });
  observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  await act(async () => { await fn(); });
  records.push(...observer.takeRecords());
  observer.disconnect();
  const work: DomWork = { elementsAdded: 0, elementsRemoved: 0, attributeChanges: 0, textChanges: 0 };
  for (const r of records) {
    if (r.type === "childList") { work.elementsAdded += elements(r.addedNodes); work.elementsRemoved += elements(r.removedNodes); }
    else if (r.type === "attributes") work.attributeChanges++;
    else work.textChanges++;
  }
  return work;
}

export const domSize = (view: RenderResult) => view.container.getElementsByTagName("*").length;
