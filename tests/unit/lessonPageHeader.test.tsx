import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { LessonCover } from "@/components/learn/editor/PageHeader";
import { autoCovers, coverGallery, defaultCover, isCoverUrl, randomCover } from "@/lib/learn/covers";
import type { LessonMeta } from "@/lib/learn/types";

const meta = (patch: Partial<LessonMeta> = {}): LessonMeta => ({ title: "Cells", description: "", tags: [], language: "en", curricula: [], indexing: "noindex", ...patch });

describe("Notion-style lesson page header", () => {
  it("always shows a cover: the saved one, or a stable default for the page", () => {
    const { container, rerender } = render(<LessonCover id="lesson-1" meta={meta()} editable={false} onChange={vi.fn()} />);
    expect(container.querySelector("img")).toHaveAttribute("src", defaultCover("lesson-1"));
    rerender(<LessonCover id="lesson-1" meta={meta({ coverUrl: coverGallery[3].src })} editable={false} onChange={vi.fn()} />);
    expect(container.querySelector("img")).toHaveAttribute("src", coverGallery[3].src);
    expect(screen.queryByRole("button", { name: "Change cover" })).toBeNull();
  });

  it("changes or shuffles the cover but never removes it", () => {
    const onChange = vi.fn();
    const first = coverGallery[0];
    render(<LessonCover id="lesson-1" meta={meta({ coverUrl: first.src })} editable onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Change cover" }));
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: coverGallery[1].title }));
    expect(onChange).toHaveBeenLastCalledWith({ coverUrl: coverGallery[1].src, coverY: 50 });
    fireEvent.click(screen.getByRole("button", { name: "Random" }));
    const shuffled = onChange.mock.lastCall![0];
    expect(autoCovers).toContain(shuffled.coverUrl);
    expect(shuffled.coverUrl).not.toBe(first.src);
  });

  it("picks covers that differ from the ones already in use", () => {
    const used = autoCovers.slice(0, autoCovers.length - 2);
    for (let i = 0; i < 20; i++) expect(used).not.toContain(randomCover(used));
    expect(autoCovers).toContain(randomCover(autoCovers));
    expect(defaultCover("same")).toBe(defaultCover("same"));
  });

  it("ships every gallery file", () => {
    for (const c of coverGallery) expect(existsSync(`public${c.src}`), c.src).toBe(true);
  });

  it("accepts https links and bundled covers only", () => {
    expect(coverGallery.every((c) => isCoverUrl(c.src))).toBe(true);
    expect(coverGallery.filter((c) => c.category !== "color").every((c) => c.license && /public domain|cc0/i.test(c.license))).toBe(true);
    expect(isCoverUrl("https://example.com/a.jpg")).toBe(true);
    expect(isCoverUrl("http://example.com/a.jpg")).toBe(false);
    expect(isCoverUrl("/covers/../secret.jpg")).toBe(false);
  });
});
