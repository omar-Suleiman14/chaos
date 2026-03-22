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
    <div className="min-h-screen bg-[#F0EFEA] text-[#111111] font-sans flex flex-col items-center justify-center p-6 selection:bg-[#2F5333] selection:text-white">
      
      <div className="max-w-xl w-full text-center flex flex-col items-center gap-10">
        
        <h1 className="font-sans font-medium tracking-tight text-5xl sm:text-6xl text-[#111111]">
          chaos
        </h1>
        
        <p className="text-lg sm:text-xl text-[#111111]/70 leading-relaxed max-w-md">
          Create and share interactive quizzes. No accounts needed for players. Instant live results.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-4">
          {isSignedIn ? (
            <Link
              href="/dashboard"
              onClick={() => { trigger("success"); sfx.play("start"); }}
              className="px-8 py-4 bg-[#2F5333] text-white rounded-full font-medium text-sm hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              Enter Dashboard
            </Link>
          ) : (
            <>
              <SignUpButton mode="modal">
                <button
                  onClick={() => { trigger("success"); sfx.play("start"); }}
                  className="px-8 py-4 bg-[#2F5333] text-white rounded-full font-medium text-sm hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                  Start Free
                </button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button
                  onClick={() => { trigger("light"); sfx.play("select"); }}
                  className="px-8 py-4 bg-transparent text-[#111111] border border-[#111111]/20 rounded-full font-medium text-sm hover:bg-[#111111]/5 transition-colors whitespace-nowrap"
                >
                  Log In
                </button>
              </SignInButton>
            </>
          )}
        </div>
      </div>
      
    </div>
  );
}
