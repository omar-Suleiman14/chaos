"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

import { UserButton, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState } from "react";
import { Plus, FileText, BarChart3, Settings, Shield, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { href: "/dashboard", label: "Quizzes", icon: FileText },
  { href: "/dashboard/results", label: "Results", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const pathname = usePathname();
  const getOrCreateUser = useMutation(api.quizFunctions.getOrCreateUser);
  const isAdmin = useQuery(api.quizFunctions.getIsAdmin) === true;
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (isLoaded && user) {
      getOrCreateUser().catch((err: any) => {
        setActionError(err?.message || "Your account could not be initialized. Please retry.");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation ref is stable in behavior
  }, [isLoaded, user]);

  const router = useRouter();
  const createQuiz = useMutation(api.quizFunctions.createQuiz);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateNew = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setActionError("");
    try {
      const newId = await createQuiz({ title: "Untitled Quiz" });
      router.push(`/dashboard/editor?id=${newId}`);
    } catch (e) {
      const err = e as any;
      setActionError(err?.message || "The quiz could not be created. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const isEditor = pathname.startsWith("/dashboard/editor");

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans">
      <header className="sticky top-0 z-40 h-16 border-b border-border/10 bg-card flex items-center justify-between px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-medium tracking-tight text-2xl text-foreground transition-opacity">
            chaos
          </Link>
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground font-medium">
            <span>/</span>
            <span className="text-foreground">
              {pathname === "/dashboard"
                ? "Quizzes"
                : pathname === "/dashboard/results"
                ? "Results"
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
            <button
              onClick={handleCreateNew}
              disabled={isCreating}
              className="flex items-center gap-2 text-sm bg-primary text-on-primary px-4 py-2 rounded-full font-medium transition-colors disabled:opacity-50"
            >
              <Plus size={16} />
            </button>
          )}
          <ThemeToggle />
          <UserButton />
        </div>
      </header>

      {!isEditor && (
        <nav className="sticky top-16 z-30 border-b border-border/10 bg-background/80 backdrop-blur-md flex overflow-x-auto shrink-0 scrollbar-hide px-4 sm:px-6 py-2 gap-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                  isActive
                    ? "bg-card text-primary shadow-sm border border-border/5"
                    : "text-muted-foreground"
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
                  ? "bg-card text-destructive shadow-sm border border-border/5"
                  : "text-destructive/60"
              }`}
            >
              <Shield size={16} />
              Admin
            </Link>
          )}
        </nav>
      )}

      <main className="flex-1 p-6 lg:p-10 w-full max-w-7xl mx-auto flex flex-col">
        {actionError && (
          <div role="alert" className="mb-6 flex items-start justify-between gap-4 border-2 border-destructive bg-destructive/10 p-4 text-sm text-destructive">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError("")} aria-label="Dismiss error" className="shrink-0">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1">
          {children}
        </div>
        
        {/* Global Dashboard Footer */}
        <div className="mt-16 pt-8 border-t border-border/10 flex flex-col items-center justify-center text-center space-y-4 pb-8">
          <p className="text-sm font-medium text-muted-foreground">NEED HELP OR HAVE FEEDBACK?</p>
          <a
            href="mailto:support@chaos.fail"
            className="inline-flex items-center gap-2 text-sm font-mono font-medium text-muted-foreground border-2 border-dotted border-outline px-4 py-2 transition-colors rounded-sm"
          >
            CONTACT SUPPORT: support@chaos.fail
          </a>
        </div>
      </main>
    </div>
  );
}
