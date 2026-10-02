"use client";

import { Blobatar } from "@blobatar/react";
import { useGaze } from "@blobatar/react/gaze";
import "blobatar/motion.css";
import "blobatar/gaze.css";

/** Everyone's picture in Chaos: a deterministic blobatar from their avatar seed (lib/avatarSeed). The eyes follow the pointer. */
export default function MemberAvatar({ seed, size = 28, className, label }: { seed: string; size?: number; className?: string; label?: string }) {
  const { ref } = useGaze({ travel: Math.max(1, size * 0.06), lookAt: "pointer" });
  return (
    <span className={className} style={{ display: "inline-flex", width: size, height: size, flex: "none" }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <Blobatar ref={ref} name={seed} size={size} animate="hover" />
    </span>
  );
}
