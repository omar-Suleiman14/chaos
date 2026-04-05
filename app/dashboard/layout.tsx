"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { UserButton, useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect } from "react";
import { Sun, Moon, Plus, FileText, BarChart3, Settings, Shield } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Quizzes", icon: FileText },
  { href: "/dashboard/stats", label: "Stats", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const pathname = usePathname();
  const getOrCreateUser = useMutation(api.quizFunctions.getOrCreateUser);

  useEffect(() => {
    if (isLoaded && user) {
      getOrCreateUser().catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation ref is stable in behavior
  }, [isLoaded, user]);

  const ADMIN_EMAILS = ["support@chaos.fail", "khomod14@gmail.com"];
  const isAdmin =
    isLoaded && ADMIN_EMAILS.includes(user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? "");

  const isEditor = pathname.startsWith("/dashboard/editor");

  return (
    <div className="min-h-screen flex flex-col bg-[#F0EFEA] text-[#111111] font-sans">
      <header className="sticky top-0 z-40 h-16 border-b border-[#111111]/10 bg-white flex items-center justify-between px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-medium tracking-tight text-2xl text-[#111111] hover:opacity-80 transition-opacity">
            chaos
          </Link>
          <div className="hidden sm:flex items-center gap-2 text-sm text-[#111111]/50 font-medium">
            <span>/</span>
            <span className="text-[#111111]">
              {pathname === "/dashboard"
                ? "Quizzes"
                : pathname === "/dashboard/stats"
                ? "Stats"
                : pathname === "/dashboard/settings"
                ? "Settings"
                : pathname.startsWith("/dashboard/editor")
                ? "Editor"
                : "Dashboard"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!isEditor && (
            <Link
              href="/dashboard/editor"
              className="flex items-center gap-2 text-sm bg-[#2F5333] text-white px-4 py-2 rounded-full font-medium hover:bg-[#2F5333]/90 transition-colors"
            >
              <Plus size={16} />
            </Link>
          )}
          <UserButton />
        </div>
      </header>

      {!isEditor && (
        <nav className="sticky top-16 z-30 border-b border-[#111111]/10 bg-[#F0EFEA]/80 backdrop-blur-md flex overflow-x-auto shrink-0 scrollbar-hide px-4 sm:px-6 py-2 gap-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                  isActive
                    ? "bg-white text-[#2F5333] shadow-sm border border-[#111111]/5"
                    : "text-[#111111]/60 hover:bg-[#111111]/5"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                pathname === "/admin"
                  ? "bg-white text-red-600 shadow-sm border border-[#111111]/5"
                  : "text-red-600/60 hover:bg-red-600/10"
              }`}
            >
              <Shield size={16} />
              Admin
            </Link>
          )}
        </nav>
      )}

      <main className="flex-1 p-6 lg:p-10 w-full max-w-7xl mx-auto flex flex-col">
        <div className="flex-1">
          {children}
        </div>
        
        {/* Global Dashboard Footer */}
        <div className="mt-16 pt-8 border-t border-[#111111]/10 flex flex-col items-center justify-center text-center space-y-4 pb-8">
          <p className="text-sm font-medium text-[#111111]/60">NEED HELP OR HAVE FEEDBACK?</p>
          <a
            href="mailto:support@chaos.fail"
            className="inline-flex items-center gap-2 text-sm font-mono font-medium text-[#111111]/70 hover:text-[#111111] border-2 border-dotted border-[#111111]/40 hover:border-[#111111] px-4 py-2 transition-colors rounded-sm"
          >
            CONTACT SUPPORT: support@chaos.fail
          </a>
        </div>
      </main>
    </div>
  );
}
