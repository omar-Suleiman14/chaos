import type { Metadata } from "next";
import ErrorScreen from "@/components/site/ErrorScreen";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <ErrorScreen
      title="Nothing here"
      body="This page doesn't exist or isn't available to you."
      primary={{ label: "Go home", href: "/" }}
    />
  );
}
