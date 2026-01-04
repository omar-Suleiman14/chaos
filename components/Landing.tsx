'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs';
import { ArrowRight, Lock, Zap, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Landing: React.FC = () => {
  const { isSignedIn } = useUser();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#050505] text-[#e0e0e0] flex flex-col font-sans selection:bg-chaos-accent selection:text-black overflow-x-hidden">
      {/* Navigation */}
      <nav className="flex justify-between items-center px-4 sm:px-6 md:px-8 lg:px-12 py-6 max-w-7xl mx-auto w-full z-50 relative">
        <div className="flex items-center gap-3 group cursor-pointer" onClick={() => router.push('/')}>
          <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-600 rounded-lg blur-[1px] opacity-90"></div>
          <span className="font-serif text-2xl italic tracking-wide text-white group-hover:opacity-80 transition">Chaos</span>
        </div>
        <div className="hidden md:flex gap-12 text-sm font-medium tracking-wide text-gray-500 uppercase">
          <a href="#features" className="hover:text-[#D4BFA3] transition duration-300">Features</a>
          <a href="#philosophy" className="hover:text-[#D4BFA3] transition duration-300">Manifesto</a>
        </div>
        <div className="flex gap-4 items-center">
          {isSignedIn ? (
            <div className="flex items-center gap-4">
              <Button
                onClick={() => router.push('/dashboard')}
                variant="chaos"
                className="px-6"
              >
                Enter Dashboard
              </Button>
              <UserButton afterSignOutUrl="/" />
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <SignInButton mode="modal">
                <button className="text-sm font-medium text-gray-400 hover:text-white transition uppercase tracking-wide">
                  Log in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button variant="chaos" className="px-8">
                  Join
                </Button>
              </SignUpButton>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-grow relative pt-20 md:pt-32 pb-32 px-4 flex flex-col items-center justify-center min-h-[80vh]">
        {/* Abstract Background Elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] bg-[#D4BFA3] rounded-full blur-[180px] opacity-[0.03] pointer-events-none"></div>

        <div className="z-10 text-center max-w-5xl mx-auto space-y-8 relative">
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-100">
            <h1 className="font-serif text-6xl sm:text-7xl md:text-9xl leading-[0.9] text-white tracking-tighter mix-blend-screen">
              Order from<br />
              <span className="text-[#D4BFA3] italic opacity-90">Entropy.</span>
            </h1>
          </div>

          <p className="text-gray-500 text-base md:text-xl max-w-xl mx-auto font-light leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
            The learning platform for those who reject the mundane.
            Create interactive experiences that defy expectation.
          </p>

          <div className="pt-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
            {isSignedIn ? (
              <Button
                onClick={() => router.push('/dashboard')}
                size="lg"
                className="bg-[#D4BFA3] text-black hover:bg-[#c2aa8a] text-lg px-10 py-8 rounded-full transition-all duration-500 hover:scale-105 hover:shadow-[0_0_40px_-10px_rgba(212,191,163,0.3)]"
              >
                Go to Dashboard
              </Button>
            ) : (
              <SignUpButton mode="modal">
                <Button
                  size="lg"
                  className="bg-[#D4BFA3] text-black hover:bg-[#c2aa8a] text-lg px-10 py-8 rounded-full transition-all duration-500 hover:scale-105 hover:shadow-[0_0_40px_-10px_rgba(212,191,163,0.3)]"
                >
                  Start Creating
                </Button>
              </SignUpButton>
            )}
          </div>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce opacity-20">
          <ArrowRight className="rotate-90" />
        </div>
      </main>

      {/* Features Grid - Architectural Style */}
      <section id="features" className="py-32 px-4 md:px-12 bg-[#080808] relative overflow-hidden">
        {/* Grid Lines Background */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}></div>

        <div className="max-w-7xl mx-auto relative z-10">
          <h2 className="font-serif text-4xl md:text-6xl mb-20 text-white text-center">The Architecture</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#222]">
            {[
              { title: "Fluidity", desc: "Interactions that feel liquid. Answer with a scroll, navigate with a gesture.", icon: <Zap size={24} /> },
              { title: "Sovereignty", desc: "Your data remains yours. No tracking, no noise. Just pure focus.", icon: <Lock size={24} /> },
              { title: "Velocity", desc: "Build quizzes at the speed of thought. Share them in an instant.", icon: <Globe size={24} /> }
            ].map((feature, i) => (
              <div key={i} className="bg-[#080808] p-12 hover:bg-[#0c0c0c] transition duration-500 group">
                <div className="text-[#D4BFA3] mb-6 opacity-50 group-hover:opacity-100 transition-opacity">{feature.icon}</div>
                <h3 className="font-serif text-2xl mb-4 text-white group-hover:text-[#D4BFA3] transition-colors">{feature.title}</h3>
                <p className="text-gray-500 leading-relaxed text-sm tracking-wide">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy - Manifesto Style */}
      <section id="philosophy" className="py-40 px-4 md:px-12 bg-black text-center relative">
        <div className="max-w-4xl mx-auto">
          <span className="text-[#D4BFA3] text-xs font-bold tracking-[0.3em] uppercase mb-8 block">Manifesto</span>
          <h2 className="font-serif text-3xl md:text-5xl lg:text-6xl leading-tight text-white mb-12">
            "Knowledge deserves <br /> better than <span className="text-[#333] line-through decoration-[#D4BFA3]">boxes</span>."
          </h2>
          <p className="text-gray-400 text-lg md:text-2xl leading-relaxed font-light px-8 max-w-3xl mx-auto">
            We built Chaos because the internet is loud, but learning should be quiet.
            Beautiful. Intentional. It's not about gamification; it's about
            <span className="text-[#D4BFA3] italic mx-2">reverence</span>
            for the subject matter. When the interface disappears, only understanding remains.
          </p>
        </div>
      </section>

      <footer className="py-12 bg-black border-t border-[#111] text-center">
        <div className="flex items-center justify-center gap-3 mb-6 opacity-40 hover:opacity-100 transition duration-500">
          <div className="w-4 h-4 bg-gradient-to-br from-orange-400 to-red-600 rounded blur-[0.5px]"></div>
          <span className="font-serif text-lg italic tracking-widest text-white uppercase">Chaos</span>
        </div>
        <p className="text-[#333] text-xs tracking-widest uppercase">&copy; 2026 Chaos.</p>
      </footer>
    </div>
  );
};

export default Landing;