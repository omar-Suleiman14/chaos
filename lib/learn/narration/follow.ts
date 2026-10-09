/**
 * Follows narration on the page: a tint behind the paragraph, sentence or word being read.
 *
 * Imperative and React-free on purpose: word events arrive several times a second and only
 * move a few absolutely positioned boxes in one overlay layer (aria-hidden, pointer-events
 * none). The lesson DOM is never mutated, so saved highlights, selection offsets and screen
 * readers are unaffected. Boxes glide between positions with CSS transitions (none when
 * motion is reduced).
 */
import type { SpeechStep } from "./sequence";
import { prefersReducedMotion } from "@/lib/learn/motion";
import type { NarrationColor } from "@/lib/learn/readerPrefs";
import { narrationVars } from "./palette";

export type FollowMode = "word" | "sentence" | "paragraph" | "off";
export interface Box { x: number; y: number; w: number; h: number }

/** Controls and annotations drawn inside blocks that are not part of the block's text. */
const NOT_TEXT = ".lx-block__handle, .lx-block__marks, .lx-note-inline, .lx-callout__icon, button, input, textarea, script, style, .lx-narr-layer";

/** Text nodes of a block whose characters line up with the block's plain text (`inlineText`). */
export function textIndex(el: Element): { nodes: Text[]; starts: number[]; length: number } {
  const nodes: Text[] = [], starts: number[] = [];
  let length = 0;
  const container = el.matches(".lx-block, li");
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      // Text sitting directly in a block container is layout whitespace, not content.
      if (node.nodeType === Node.TEXT_NODE) return node.parentElement === el && container ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      const e = node as Element;
      return e !== el && (e.matches(NOT_TEXT) || e.hasAttribute("data-block-id")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    nodes.push(t); starts.push(length); length += t.data.length;
  }
  return { nodes, starts, length };
}

/** A DOM range over display offsets [s, e) of a block, or null when they are not on the page. */
export function rangeFor(index: ReturnType<typeof textIndex>, s: number, e: number): Range | null {
  if (!index.nodes.length || e <= s || s >= index.length) return null;
  const locate = (at: number, end: boolean) => {
    let i = index.starts.length - 1;
    while (i > 0 && (index.starts[i] > at || (end && index.starts[i] === at))) i--;
    return { node: index.nodes[i], offset: Math.min(index.nodes[i].data.length, at - index.starts[i]) };
  };
  const a = locate(s, false), b = locate(Math.min(e, index.length), true);
  if (!a.node.isConnected || !b.node.isConnected) return null;
  const range = a.node.ownerDocument.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

/** A range's client rects; none where the engine has no layout for ranges. */
const clientRects = (range: Range): ArrayLike<DOMRect> => (typeof range.getClientRects === "function" ? range.getClientRects() : []);

/** Client rects of a range merged into one box per line. */
export function lineBoxes(rects: ArrayLike<DOMRect>): Box[] {
  const lines: Box[] = [];
  for (const r of Array.from(rects)) {
    if (r.width < 1 || r.height < 1) continue;
    const line = lines.find((l) => Math.min(l.y + l.h, r.bottom) - Math.max(l.y, r.top) > Math.min(l.h, r.height) / 2);
    if (!line) { lines.push({ x: r.left, y: r.top, w: r.width, h: r.height }); continue; }
    const right = Math.max(line.x + line.w, r.right), bottom = Math.max(line.y + line.h, r.bottom);
    line.x = Math.min(line.x, r.left); line.y = Math.min(line.y, r.top);
    line.w = right - line.x; line.h = bottom - line.y;
  }
  return lines.sort((a, b) => a.y - b.y || a.x - b.x);
}

const LINES = 12;
const USER_SCROLL_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "]);

export interface FollowerOptions {
  /** The follower stopped (or resumed) keeping the narration on screen because the reader scrolled. */
  onDetach?: (detached: boolean) => void;
  /** Space kept free at the bottom of the screen (the audio controller). */
  bottomInset?: () => number;
}

export class NarrationFollower {
  private mode: FollowMode = "sentence";
  private lines: HTMLElement[] = [];
  private word: HTMLElement;
  private block: HTMLElement;
  private step: SpeechStep | null = null;
  private target: HTMLElement | null = null;
  private index: ReturnType<typeof textIndex> | null = null;
  private wordRange: [number, number] | null = null;
  private wordTiming: boolean | null = null;
  private checkpoint: HTMLElement | null = null;
  private detached = false;
  private frame = 0;
  private observer: ResizeObserver | null = null;
  private cleanup: (() => void)[] = [];

  constructor(private root: HTMLElement, private layer: HTMLElement, private options: FollowerOptions = {}) {
    const doc = layer.ownerDocument;
    for (let i = 0; i < LINES; i++) this.lines.push(layer.appendChild(Object.assign(doc.createElement("span"), { className: "lx-narr-line" })));
    this.block = layer.appendChild(Object.assign(doc.createElement("span"), { className: "lx-narr-block" }));
    this.word = layer.appendChild(Object.assign(doc.createElement("span"), { className: "lx-narr-word" }));
    const win = doc.defaultView!;
    const userScrolled = () => this.setDetached(true);
    const onKey = (e: KeyboardEvent) => { if (USER_SCROLL_KEYS.has(e.key) && !(e.target as Element | null)?.closest?.("input, textarea, select, [contenteditable='true'], [role='slider']")) userScrolled(); };
    const relayout = () => { if (!this.frame) this.frame = win.requestAnimationFrame(() => { this.frame = 0; this.draw(false); }); };
    win.addEventListener("wheel", userScrolled, { passive: true });
    win.addEventListener("touchmove", userScrolled, { passive: true });
    win.addEventListener("keydown", onKey);
    win.addEventListener("resize", relayout);
    if (typeof ResizeObserver === "function") { this.observer = new ResizeObserver(relayout); this.observer.observe(root); }
    this.cleanup.push(() => { win.removeEventListener("wheel", userScrolled); win.removeEventListener("touchmove", userScrolled); win.removeEventListener("keydown", onKey); win.removeEventListener("resize", relayout); win.cancelAnimationFrame(this.frame); });
  }

  setMode(mode: FollowMode) { this.mode = mode; this.layer.dataset.mode = mode; this.draw(false); }
  setColor(color: NarrationColor) {
    this.layer.dataset.color = color;
    for (const [name, value] of Object.entries(narrationVars(color))) this.layer.style.setProperty(name, value);
  }

  /** A new utterance: tint its sentence (or paragraph) and bring it on screen when needed. */
  showStep(step: SpeechStep, wordTiming: boolean | null) {
    this.clearCheckpoint();
    const sameTarget = this.step?.target === step.target && this.target?.isConnected;
    this.step = step;
    this.wordTiming = wordTiming;
    this.wordRange = null;
    if (!sameTarget) {
      this.target = step.target ? this.root.ownerDocument.getElementById(step.target) : null;
      this.index = null;
      // Content inside a collapsed toggle is opened so it can be followed.
      const details = this.target?.parentElement?.closest("details");
      if (details && !details.open && this.root.contains(details)) details.open = true;
    }
    this.draw(true);
  }

  /** The word being spoken; null hides the word box (the sentence stays). */
  showWord(range: [number, number] | null) {
    if (this.wordTiming !== true) { this.wordTiming = true; this.layer.dataset.words = "on"; }
    this.wordRange = range;
    if (this.mode === "word") this.drawWord();
  }

  /** Narration stopped at an activity: clear the tint, bring the activity into view and mark it. */
  showCheckpoint(target: string) {
    this.hide();
    this.step = null;
    const el = this.root.ownerDocument.getElementById(target);
    if (!el) return;
    this.checkpoint = el;
    el.dataset.narrationCheckpoint = "true";
    this.setDetached(false);
    el.scrollIntoView?.({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  /** Bring the current narration back on screen and keep following it. */
  reattach() {
    this.setDetached(false);
    this.draw(true, true);
  }

  clear() { this.clearCheckpoint(); this.step = null; this.target = null; this.hide(); }

  destroy() {
    this.clear();
    this.observer?.disconnect();
    this.cleanup.forEach((fn) => fn());
    this.layer.replaceChildren();
  }

  private clearCheckpoint() {
    if (this.checkpoint) delete this.checkpoint.dataset.narrationCheckpoint;
    this.checkpoint = null;
  }

  private setDetached(detached: boolean) {
    if (detached === this.detached || (detached && !this.step)) return;
    this.detached = detached;
    this.options.onDetach?.(detached);
  }

  private hide() {
    for (const el of this.lines) el.dataset.on = "false";
    this.block.dataset.on = "false";
    this.word.dataset.on = "false";
  }

  private place(el: HTMLElement, box: Box, origin: DOMRect, padX: number, padY: number) {
    // A box that was hidden appears in place (fading in) instead of gliding from where it last was.
    const appearing = el.dataset.on !== "true";
    if (appearing) el.style.transition = "none";
    el.style.transform = `translate(${Math.round(box.x - origin.left - padX)}px, ${Math.round(box.y - origin.top - padY)}px)`;
    el.style.width = `${Math.round(box.w + padX * 2)}px`;
    el.style.height = `${Math.round(box.h + padY * 2)}px`;
    if (appearing) { void el.offsetWidth; el.style.transition = ""; }
    el.dataset.on = "true";
  }

  /** Redraw the current position; `scroll` brings it on screen when it is not comfortably visible. */
  private draw(scroll: boolean, force = false) {
    const step = this.step, target = this.target;
    if (!step || !target || !target.isConnected || this.mode === "off") { this.hide(); return; }
    this.layer.dataset.words = this.wordTiming === false ? "none" : this.wordTiming ? "on" : "unknown";
    const origin = this.layer.getBoundingClientRect();
    let boxes: Box[] = [];
    if (this.mode !== "paragraph" && step.sentence) {
      this.index ??= textIndex(target);
      let range = rangeFor(this.index, step.sentence[0], step.sentence[1]);
      // The block re-rendered (a highlight was added): index its new text nodes.
      if (!range) { this.index = textIndex(target); range = rangeFor(this.index, step.sentence[0], step.sentence[1]); }
      boxes = range ? lineBoxes(clientRects(range)) : [];
    }
    if (boxes.length) {
      this.block.dataset.on = "false";
      this.lines.forEach((el, i) => { if (boxes[i]) this.place(el, boxes[i], origin, 3, 1); else el.dataset.on = "false"; });
    } else {
      // Paragraph mode, and blocks read as a whole (tables, figures, equations).
      for (const el of this.lines) el.dataset.on = "false";
      const r = target.getBoundingClientRect();
      boxes = [{ x: r.left, y: r.top, w: r.width, h: r.height }];
      this.place(this.block, boxes[0], origin, 8, 5);
    }
    // Between sentences the word box waits where it is and glides to the next first word,
    // unless this voice gives no word timing to move it.
    if (this.mode !== "word" || (!this.wordRange && this.wordTiming !== true)) this.word.dataset.on = "false";
    else if (this.wordRange) this.drawWord();
    if (scroll) this.keepInView(boxes, force);
  }

  private drawWord() {
    const step = this.step;
    if (!step?.sentence || !this.target || !this.wordRange) { this.word.dataset.on = "false"; return; }
    this.index ??= textIndex(this.target);
    let range = rangeFor(this.index, this.wordRange[0], this.wordRange[1]);
    if (!range) { this.index = textIndex(this.target); range = rangeFor(this.index, this.wordRange[0], this.wordRange[1]); }
    const box = range ? lineBoxes(clientRects(range))[0] : undefined;
    if (!box) { this.word.dataset.on = "false"; return; }
    this.place(this.word, box, this.layer.getBoundingClientRect(), 2, 1);
  }

  private keepInView(boxes: Box[], force: boolean) {
    if (!boxes.length) return;
    const win = this.root.ownerDocument.defaultView!;
    const top = Math.min(...boxes.map((b) => b.y));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    const header = 72, footer = (this.options.bottomInset?.() ?? 0) + 24;
    const visible = top >= header && bottom <= win.innerHeight - footer;
    if (visible) { this.setDetached(false); return; }
    // The reader scrolled away to read something else: do not pull them back.
    if (this.detached && !force) return;
    const tall = bottom - top > win.innerHeight - header - footer;
    win.scrollTo({ top: win.scrollY + top - (tall ? header + 8 : win.innerHeight * 0.3), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }
}
