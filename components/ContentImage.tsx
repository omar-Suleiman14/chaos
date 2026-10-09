import type { ComponentPropsWithRef } from "react";

/** Images from lesson content, signed storage URLs, inline diagrams or interactive editor previews. */
export function ContentImage({ alt, ...props }: ComponentPropsWithRef<"img"> & { alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- These arbitrary or signed content URLs must load directly; preserve their intrinsic dimensions and SVG/data URL support.
  return <img {...props} alt={alt} />;
}
