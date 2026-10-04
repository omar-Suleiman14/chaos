import type { Metadata } from "next";
import DashboardShell from "./DashboardShell";
import "@/components/learn/learn.css";

export const metadata: Metadata = {
  title: { absolute: "Chaos" },
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
