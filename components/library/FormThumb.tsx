import { memo } from "react";
import { headingFontStacks } from "@/components/forms/formThemes";
import { useCopy } from "@/lib/i18n";
import type { FormTheme, Presentation } from "@/convex/formLogic";

const hex = (value: string | undefined, fallback: string) => (value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback);

const copy = { en: { untitled: "Untitled" }, ar: { untitled: "بلا عنوان" } };

/** A miniature of how a form looks to respondents: theme colours, font and presentation mode. */
function FormThumb({ theme, presentation, title }: { theme?: FormTheme; presentation?: Presentation; title: string }) {
  const t = useCopy(copy);
  const themed = theme?.version === 1;
  const page = themed ? hex(theme.pageColor, "#f5f4f0") : "#f0efea";
  const surface = themed ? hex(theme.surfaceColor, "#ffffff") : "#ffffff";
  const text = themed ? hex(theme.textColor, "#202020") : "#111111";
  const accent = hex(theme?.accent, "#22c55e");
  const font = theme?.font ?? "display";
  const mode = presentation ?? "page";
  const line = (width: string, color = text, opacity = 0.18) => <span className="block h-[5px] rounded-full" style={{ width, background: color, opacity }} />;

  return (
    <span className="ws-card__thumb-inner" style={{ background: page, color: text, ["--thumb-font" as string]: headingFontStacks[font] ?? headingFontStacks.sans }} aria-hidden="true">
      {theme?.backdrop === "dots" && <span className="absolute inset-0" style={{ backgroundImage: `radial-gradient(${text}22 1px, transparent 1.4px)`, backgroundSize: "12px 12px" }} />}
      {theme?.backdrop === "grid" && <span className="absolute inset-0" style={{ backgroundImage: `linear-gradient(${accent}26 1px, transparent 1px), linear-gradient(90deg, ${accent}26 1px, transparent 1px)`, backgroundSize: "18px 18px" }} />}
      {(theme?.backdrop === "gradient" || theme?.backdrop === "aurora") && <span className="absolute inset-0" style={{ background: `radial-gradient(70% 70% at 90% 0%, ${accent}55, transparent 70%)` }} />}
      {mode === "swipe" ? (
        <span className="absolute left-1/2 top-3 bottom-[-12px] w-[74px] -translate-x-1/2 rounded-[12px] p-2 flex flex-col justify-center gap-1.5" style={{ background: accent, color: surface }}>
          <span className="block text-[9px] font-bold leading-tight line-clamp-2" style={{ fontFamily: "var(--thumb-font)", color: page }}>{title || t.untitled}</span>
          {[0, 1].map((i) => <span key={i} className="block h-[10px] rounded-[4px]" style={{ background: page, opacity: 0.85 }} />)}
        </span>
      ) : mode === "conversational" ? (
        <span className="absolute inset-0 flex flex-col justify-center gap-2 px-5">
          <span className="block text-[13px] font-semibold leading-tight line-clamp-1" style={{ fontFamily: "var(--thumb-font)" }}><span style={{ color: accent }}>1 → </span>{title || t.untitled}</span>
          {["A", "B"].map((k) => (
            <span key={k} className="flex items-center gap-1.5 w-[60%] rounded-[5px] px-1.5 py-1" style={{ border: `1px solid ${accent}66`, background: `${accent}14` }}>
              <span className="grid place-items-center w-3.5 h-3.5 rounded-[3px] text-[7px] font-bold" style={{ border: `1px solid ${accent}`, color: accent }}>{k}</span>
              {line("60%", text, 0.25)}
            </span>
          ))}
          <span className="absolute bottom-0 left-0 h-[3px] w-[40%]" style={{ background: accent }} />
        </span>
      ) : (
        <span className="absolute inset-x-5 top-4 bottom-[-10px] rounded-t-[8px] p-3 flex flex-col gap-2" style={{ background: themed && theme.layout === "card" ? surface : "transparent", boxShadow: themed && theme.layout === "card" ? `0 6px 18px -8px ${text}40` : "none" }}>
          <span className="block text-[13px] font-bold leading-tight line-clamp-1" style={{ fontFamily: "var(--thumb-font)", textTransform: theme?.buttons === "brutal" ? "uppercase" : undefined }}>{title || t.untitled}</span>
          {line("80%")}
          <span className="block h-[14px] rounded-[4px]" style={{ border: `1px solid ${text}30`, background: surface }} />
          <span className="block h-[12px] w-[34%] rounded-[4px]" style={{ background: accent, boxShadow: theme?.buttons === "brutal" ? `2px 2px 0 ${text}` : "none" }} />
        </span>
      )}
    </span>
  );
}

/** Memoised: library search and filter re-render the grid on every keystroke; thumbnails only change with their form. */
export default memo(FormThumb);
