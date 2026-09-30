"use client";

import { Component } from "react";

/**
 * Renders `fallback` if anything inside throws. Used where a newer backend
 * function may not be deployed yet, so older features keep working meanwhile.
 */
export default class FallbackBoundary extends Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
