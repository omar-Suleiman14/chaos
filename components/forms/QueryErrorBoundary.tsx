"use client";

import { Component, type ReactNode } from "react";
import { useCopy } from "@/lib/i18n";

class Boundary extends Component<{ children: ReactNode; message: string; retry: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="alert" className="ws-empty"><p>{this.props.message}</p><button type="button" className="ws-btn" onClick={() => this.setState({ failed: false })}>{this.props.retry}</button></div>;
    return this.props.children;
  }
}

/** Query failures stay inside the feature, leaving the surrounding form usable. */
export default function QueryErrorBoundary({ children }: { children: ReactNode }) {
  const t = useCopy({ en: { message: "This view is unavailable. Check your access and try again.", retry: "Try again" }, ar: { message: "هذا العرض غير متاح. تحقق من صلاحية الوصول وحاول مجددًا.", retry: "حاول مجددًا" } });
  return <Boundary {...t}>{children}</Boundary>;
}
