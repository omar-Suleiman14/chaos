/* eslint-disable @next/next/no-img-element -- a tiny static SVG; next/image adds nothing here */

/** The Chaos mark (public/icon.svg). */
export default function Logo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return <img src="/icon.svg" alt="" width={size} height={size} className={`shrink-0 ${className}`} style={{ width: size, height: size }} />;
}
