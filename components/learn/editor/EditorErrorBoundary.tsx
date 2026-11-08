"use client";

import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: {
    editorTitle: "The editor stopped working",
    editorBody: "Your last changes are kept on this device. Reopen the editor to continue; nothing has been deleted.",
    reopen: "Reopen editor",
    block: "This block could not be shown. The rest of the lesson still works, and the block is kept as it was.",
    retry: "Try again",
    details: "Technical details",
  },
  ar: {
    editorTitle: "توقف المحرر عن العمل",
    editorBody: "آخر تغييراتك محفوظة على هذا الجهاز. أعد فتح المحرر للمتابعة؛ لم يُحذف شيء.",
    reopen: "أعد فتح المحرر",
    block: "تعذّر عرض هذه الكتلة. بقية الدرس تعمل، والكتلة محفوظة كما كانت.",
    retry: "حاول مرة أخرى",
    details: "تفاصيل تقنية",
  },
};

interface Props { children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode; onError?: (error: Error, info: ErrorInfo) => void }
interface State { error: Error | null }

/** Catches a render failure below it; `reset` renders the children again. */
class EditorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: unknown): State { return { error: error instanceof Error ? error : new Error(String(error)) }; }
  componentDidCatch(error: Error, info: ErrorInfo) { this.props.onError?.(error, info); }
  reset = () => this.setState({ error: null });
  render() { return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children; }
}

function EditorFallback({ error, onReopen }: { error: Error; onReopen: () => void }) {
  const t = useCopy(copy);
  return (
    <div className="lx-notice lx-editor-crash" role="alert">
      <strong>{t.editorTitle}</strong>
      <p>{t.editorBody}</p>
      <button type="button" className="ws-btn ws-btn--sm" onClick={onReopen}>{t.reopen}</button>
      <details><summary>{t.details}</summary><pre className="lx-editor-crash__detail">{error.message}</pre></details>
    </div>
  );
}

/** The whole editor: a crash keeps the page (title, save state, recovery) and offers a clean remount. */
export function LessonEditorBoundary({ children, onReopen, onError }: { children: ReactNode; onReopen: () => void; onError?: (error: Error) => void }) {
  return <EditorBoundary onError={onError} fallback={(error, reset) => <EditorFallback error={error} onReopen={() => { reset(); onReopen(); }} />}>{children}</EditorBoundary>;
}

function BlockFallback({ error, reset }: { error: Error; reset: () => void }) {
  const t = useCopy(copy);
  return (
    <div className="lx-block-crash" role="alert" contentEditable={false} title={error.message}>
      <span>{t.block}</span>
      <button type="button" className="ws-btn ws-btn--sm ws-btn--ghost" onClick={reset}>{t.retry}</button>
    </div>
  );
}

/**
 * Wraps a custom block renderer (blocks without editable inline content) so that one failing
 * block shows a notice in its place instead of taking the editor down. The block's data is
 * untouched: it is still saved, moved and deleted like any other block.
 */
export function isolatedBlock<P extends object>(Render: ComponentType<P>): ComponentType<P> {
  function IsolatedBlock(props: P) {
    return <EditorBoundary fallback={(error, reset) => <BlockFallback error={error} reset={reset} />}><Render {...props} /></EditorBoundary>;
  }
  IsolatedBlock.displayName = `Isolated(${Render.displayName ?? Render.name ?? "Block"})`;
  return IsolatedBlock;
}
