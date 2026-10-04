"use client";

import { useCallback, useEffect, useRef } from "react";
import MemberAvatar from "@/components/MemberAvatar";
import { useTilt } from "@/components/card/useTilt";

const seeds = [
  "chaos-sun",
  "chaos-lilac",
  "chaos-mint",
  "chaos-peach",
  "chaos-sky",
];

/** Uses the same repel physics as the member cards, with pointer-following eyes. */
export default function HeroAvatars() {
  const stage = useRef<HTMLDivElement>(null);
  const cards = useCallback(
    () =>
      Array.from(
        stage.current?.querySelectorAll<HTMLElement>(".hero-avatar") ?? [],
      ),
    [],
  );
  useTilt(stage, cards, true);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const hero = stage.current?.parentElement;
      if (!hero) return;
      const top = hero.getBoundingClientRect().top + window.scrollY;
      const drift = Math.min(100, Math.max(0, window.scrollY - top) * 0.22);
      stage.current?.style.setProperty(
        "--hero-scroll-drift",
        `${drift.toFixed(1)}px`,
      );
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", scroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div ref={stage} className="hero-avatars" aria-hidden="true">
      {seeds.map((seed, index) => (
        <div className={`hero-avatar hero-avatar--${index + 1}`} key={seed}>
          <div className="hero-avatar__motion">
            <MemberAvatar seed={seed} size={88} animate="always" />
          </div>
        </div>
      ))}
    </div>
  );
}
