import type { Metadata } from "next";
import DashboardShell from "./DashboardShell";
import CacheScope from "@/components/workspace/CacheScope";
import "@/components/learn/learn.css";

export const metadata: Metadata = {
  title: { absolute: "Chaos" },
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <><CacheScope /><DashboardShell>{children}</DashboardShell></>;
}
