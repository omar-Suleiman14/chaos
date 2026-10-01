"use client";

import { Blobatar } from "@blobatar/react";
import "blobatar/motion.css";

/** Everyone's picture in Chaos: a deterministic blobatar from their avatar seed (lib/avatarSeed). */
export default function MemberAvatar({ seed, size = 28, className, label }: { seed: string; size?: number; className?: string; label?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", width: size, height: size, flex: "none" }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <Blobatar name={seed} size={size} animate="hover" />
    </span>
  );
}
