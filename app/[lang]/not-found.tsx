import type { Metadata } from "next";
import NotFoundScreen from "@/components/site/NotFoundScreen";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return <NotFoundScreen />;
}
