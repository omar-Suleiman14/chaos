/**
 * React render census. Installs itself as React's DevTools hook (the same
 * entry point React DevTools uses, present in production builds too) and, on
 * every commit, counts the components that actually rendered, the way
 * DevTools' profiler does: a subtree whose children were not re-created bailed
 * out, and a component rendered when React flagged it with PerformedWork.
 *
 * Must run before react-dom loads: a jsdom setup file, or Playwright's
 * addInitScript (it is serialized there, so it stays self-contained). If a real
 * DevTools hook is already present it is left alone.
 */
export type CensusCommit = { renders: number; top: [string, number][]; names: Record<string, number> };
export type Census = { commits: CensusCommit[]; reset(): void; since(mark: number): CensusCommit[] };

export function installFiberCensus() {
  const g = globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown; __chaosCensus?: Census };
  if (g.__REACT_DEVTOOLS_GLOBAL_HOOK__ || g.__chaosCensus) return;
  // Function, class, forwardRef, memo and simple memo components.
  const COMPONENT = new Set([0, 1, 11, 14, 15]);
  const PERFORMED_WORK = 1;
  type Fiber = { tag: number; flags: number; type: unknown; elementType: unknown; child: Fiber | null; sibling: Fiber | null; alternate: Fiber | null };
  const nameOf = (f: Fiber) => {
    const t = (f.elementType ?? f.type) as { displayName?: string; name?: string; type?: { displayName?: string; name?: string }; render?: { name?: string } } | null;
    return t?.displayName || t?.name || t?.type?.displayName || t?.type?.name || t?.render?.name || "Anonymous";
  };
  const commits: CensusCommit[] = [];
  const census: Census = {
    commits,
    reset() { commits.length = 0; },
    since(mark) { return commits.slice(mark); },
  };
  const visit = (fiber: Fiber, byName: Map<string, number>) => {
    let renders = 0;
    const stack: Fiber[] = [fiber];
    while (stack.length) {
      const f = stack.pop()!;
      if (COMPONENT.has(f.tag) && (f.flags & PERFORMED_WORK)) {
        renders++;
        const name = nameOf(f);
        byName.set(name, (byName.get(name) ?? 0) + 1);
      }
      // Children shared with the previous tree were not re-rendered.
      if (f.alternate && f.child === f.alternate.child) continue;
      for (let c = f.child; c; c = c.sibling) stack.push(c);
    }
    return renders;
  };
  let id = 0;
  g.__chaosCensus = census;
  g.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    inject(renderer: unknown) { const rid = ++id; (this as { renderers: Map<number, unknown> }).renderers.set(rid, renderer); return rid; },
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
    onCommitFiberRoot(_rid: number, root: { current: Fiber }) {
      const byName = new Map<string, number>();
      const renders = visit(root.current, byName);
      if (!renders) return;
      const top = [...byName].sort((a, b) => b[1] - a[1]).slice(0, 5);
      commits.push({ renders, top, names: Object.fromEntries(byName) });
    },
  };
}

/** Renders of one component across `commits`. */
export const rendersOf = (commits: CensusCommit[], name: string) => commits.reduce((n, c) => n + (c.names[name] ?? 0), 0);

/** Commit count, component renders and the largest single commit. */
export function summarize(commits: CensusCommit[]) {
  const renders = commits.reduce((n, c) => n + c.renders, 0);
  const spike = commits.reduce((m, c) => (c.renders > m.renders ? c : m), { renders: 0, top: [] as [string, number][], names: {} });
  return { commits: commits.length, renders, maxRendersPerCommit: spike.renders, spikeTop: spike.top };
}
