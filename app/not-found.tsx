import type { Metadata } from "next";
import ErrorScreen from "@/components/site/ErrorScreen";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <ErrorScreen
      title="Page not found"
      body="This page doesn't exist, or it has moved."
      primary={{ label: "Go home", href: "/" }}
    />
  );
}
