"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { useWebHaptics } from "web-haptics/react";
import { sfx } from "@/lib/sfx";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const { isSignedIn } = useUser();
  const { trigger } = useWebHaptics();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col items-center justify-center p-6 selection:bg-primary selection:text-on-primary">
      
      <div className="max-w-xl w-full text-center flex flex-col items-center gap-10">
        
        <h1 className="chaos-display text-7xl sm:text-8xl">
          CHAOS
        </h1>
        
        <p className="chaos-heading text-sm text-muted-foreground leading-relaxed max-w-md">
          CREATE AND SHARE INTERACTIVE QUIZZES. NO ACCOUNTS NEEDED FOR PLAYERS. INSTANT LIVE RESULTS.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-4">
          {isSignedIn ? (
            <Link
              href="/dashboard"
              onClick={() => { trigger("success"); sfx.play("start"); }}
              className="kb-btn kb-btn-primary w-full sm:w-auto px-8"
            >
              ENTER DASHBOARD
            </Link>
          ) : (
            <>
              <SignUpButton mode="modal">
                <button
                  onClick={() => { trigger("success"); sfx.play("start"); }}
                  className="kb-btn kb-btn-primary w-full sm:w-auto px-8"
                >
                  START FREE
                </button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button
                  onClick={() => { trigger("light"); sfx.play("select"); }}
                  className="kb-btn kb-btn-ghost w-full sm:w-auto px-8"
                >
                  LOG IN
                </button>
              </SignInButton>
            </>
          )}
        </div>
      </div>
      
    </div>
  );
}
