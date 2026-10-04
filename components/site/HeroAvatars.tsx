"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import MemberAvatar from "@/components/MemberAvatar";
import { useTilt } from "@/components/card/useTilt";

const seeds = [
  "chaos-sun",
  "chaos-lilac",
  "chaos-mint",
  "chaos-peach",
  "chaos-sky",
];

const motionQuery = "(min-width: 901px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const subscribeMotion = (update: () => void) => {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
};
const readMotion = () => window.matchMedia(motionQuery).matches;
const serverMotion = () => false;

/** Uses the same repel physics as the member cards, with pointer-following eyes. */
export default function HeroAvatars() {
  const motion = useSyncExternalStore(subscribeMotion, readMotion, serverMotion);
  const stage = useRef<HTMLDivElement>(null);
  const cards = useCallback(
    () =>
      Array.from(
        stage.current?.querySelectorAll<HTMLElement>(".hero-avatar") ?? [],
      ),
    [],
  );
  useTilt(stage, cards, true, motion);
  useEffect(() => {
    const hero = stage.current?.parentElement;
    const actions = hero?.querySelector<HTMLElement>(".site-hero__actions");
    if (!hero || !actions) return;
    const measure = () => {
      const bottom = actions.getBoundingClientRect().bottom - hero.getBoundingClientRect().top;
      stage.current?.style.setProperty("--hero-bottom-avatar-top", `${bottom - 44}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(hero);
    observer.observe(actions);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!motion) { stage.current?.style.removeProperty("--hero-scroll-drift"); return; }
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
  }, [motion]);
  return (
    <div ref={stage} className="hero-avatars" data-motion={motion} aria-hidden="true">
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
