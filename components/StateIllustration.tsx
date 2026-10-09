/**
 * The illustrations Chaos draws in empty, error and not-found states: six static
 * drawings in public/illustrations (provenance in the README there). One drawing
 * serves every closely related state, so pick by meaning, not by page:
 *
 * - `create`: nothing made yet (a first form, quiz, course, card set)
 * - `learn`: nothing to study or read yet (lessons, folders, saved items)
 * - `search`: filters or a search hide everything
 * - `error`: something broke
 * - `not-found`: the page or item does not exist
 * - `offline`: the connection or a service is unavailable
 *
 * Renders an inline <svg> that points at the file with <use>, so the browser
 * fetches and caches each drawing once and no artwork ships in a JS bundle. The
 * drawing reads the --ill-* tokens (app/globals.css), so it follows light and
 * dark appearance; `tone` pins one. Decorative by default: the heading next to
 * it says what happened. Pass `label` only when the picture carries meaning
 * that no nearby text does.
 */
export const illustrationVariants = ["create", "learn", "search", "error", "not-found", "offline"] as const;
export type IllustrationVariant = (typeof illustrationVariants)[number];

export default function StateIllustration({ variant, size = "compact", tone, label, className }: {
  variant: IllustrationVariant;
  /** `compact` (128px) sits above a short empty state; `hero` (up to 240px) heads a full-page state. */
  size?: "compact" | "hero";
  /** Pin the light or dark palette regardless of the page appearance. */
  tone?: "light" | "dark";
  label?: string;
  className?: string;
}) {
  return (
    <svg
      className={className ? `state-illustration ${className}` : "state-illustration"}
      data-variant={variant}
      data-size={size}
      data-tone={tone}
      viewBox="0 0 240 180"
      width={size === "hero" ? 240 : 128}
      height={size === "hero" ? 180 : 96}
      focusable="false"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <use href={`/illustrations/${variant}.svg#art`} />
    </svg>
  );
}
