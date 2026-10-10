import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import StateIllustration, { illustrationVariants } from "@/components/StateIllustration";

const dir = join(process.cwd(), "public/illustrations");
const read = (name: string) => readFileSync(join(dir, name), "utf8");

describe("state illustration", () => {
  it("is hidden from assistive technology by default and points at the static drawing", async () => {
    const { container } = render(<div><h2>No forms yet</h2><StateIllustration variant="create" /></div>);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("data-size", "compact");
    expect(svg.querySelector("use")).toHaveAttribute("href", "/illustrations/create.svg#art");
    expect(screen.queryByRole("img")).toBeNull();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("becomes a named image only when given a label", async () => {
    const { container } = render(<StateIllustration variant="not-found" size="hero" label="A signpost with blank signs" />);
    const image = screen.getByRole("img", { name: "A signpost with blank signs" });
    expect(image).not.toHaveAttribute("aria-hidden");
    expect(image).toHaveAttribute("data-size", "hero");
    expect(image).toHaveAttribute("width", "240");
    expect((await axe(container)).violations).toEqual([]);
  });

  it("sizes itself from its attributes and keeps caller classes", () => {
    const { container } = render(<StateIllustration variant="offline" className="mx-auto" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "128");
    expect(svg).toHaveAttribute("height", "96");
    expect(svg).toHaveClass("state-illustration", "mx-auto");
  });
});

describe("illustration files", () => {
  it("has exactly one drawing per variant, and nothing else", () => {
    const files = readdirSync(dir).filter((name) => name.endsWith(".svg")).sort();
    expect(files).toEqual([...illustrationVariants].map((variant) => `${variant}.svg`).sort());
  });

  it.each(illustrationVariants)("%s is small, static, text-free and themed by tokens", (variant) => {
    const svg = read(`${variant}.svg`);
    expect(svg.length).toBeLessThan(4096);
    expect(svg).toContain('viewBox="0 0 240 180"');
    expect(svg).toContain('<g id="art">');
    expect(svg).toContain("Original artwork drawn for Chaos");
    // Nothing that runs, loads, or would need translating or mirroring.
    expect(svg).not.toMatch(/<script|<text|<image|<foreignObject|\son[a-z]+=|href=|url\(/i);
    // Every colour is a theme token with a light fallback, so the file also renders on its own.
    const colours = svg.match(/#[0-9a-f]{3,6}\b/gi) ?? [];
    const tokenised = svg.match(/var\(--ill-[a-z]+,#[0-9a-f]{3,6}\)/gi) ?? [];
    expect(colours.length).toBeGreaterThan(0);
    expect(tokenised.length).toBe(colours.length);
  });

  it("gives every token the drawings use a dark value, in the existing .dark rule", () => {
    const used = new Set(illustrationVariants.flatMap((variant) => [...read(`${variant}.svg`).matchAll(/var\((--ill-[a-z]+)/g)].map((m) => m[1])));
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const dark = css.match(/\n\.dark \{([^}]*)\}/)?.[1] ?? "";
    expect(used.size).toBe(7);
    for (const token of used) expect(dark).toMatch(new RegExp(`${token}: #[0-9a-f]{6};`));
    // No rules of its own: the drawings add nothing to the CSS rule and selector budgets.
    expect(css).not.toContain(".state-illustration");
  });
});
