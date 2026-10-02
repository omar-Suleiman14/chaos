import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LessonCover, PageIconControls } from "@/components/learn/editor/PageHeader";
import { coverGallery, isCoverUrl } from "@/lib/learn/covers";
import type { LessonMeta } from "@/lib/learn/types";

const meta = (patch: Partial<LessonMeta> = {}): LessonMeta => ({ title: "Cells", description: "", tags: [], language: "en", curricula: [], indexing: "noindex", ...patch });

describe("Notion-style lesson page header", () => {
  it("adds an icon and a gallery cover from the hover row", () => {
    const onChange = vi.fn();
    render(<PageIconControls meta={meta()} editable onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Add icon" }));
    expect(onChange.mock.calls[0][0].icon).toMatch(/\S/);
    fireEvent.click(screen.getByRole("button", { name: "Add cover" }));
    const cover = onChange.mock.calls[1][0];
    expect(coverGallery.some((c) => c.src === cover.coverUrl && c.category !== "color")).toBe(true);
    expect(cover.coverY).toBe(50);
  });

  it("changes the cover from the gallery, removes it, and hides controls when read-only", () => {
    const onChange = vi.fn();
    const first = coverGallery[0];
    const { rerender } = render(<LessonCover meta={meta({ coverUrl: first.src })} editable onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Change cover" }));
    fireEvent.click(screen.getByRole("button", { name: coverGallery[1].title }));
    expect(onChange).toHaveBeenLastCalledWith({ coverUrl: coverGallery[1].src, coverY: 50 });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onChange).toHaveBeenLastCalledWith({ coverUrl: undefined, coverY: undefined });
    rerender(<LessonCover meta={meta({ coverUrl: first.src })} editable={false} onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "Change cover" })).toBeNull();
  });

  it("accepts https links and bundled covers only", () => {
    expect(coverGallery.every((c) => isCoverUrl(c.src))).toBe(true);
    expect(coverGallery.filter((c) => c.category !== "color").every((c) => c.license && /public domain|cc0/i.test(c.license))).toBe(true);
    expect(isCoverUrl("https://example.com/a.jpg")).toBe(true);
    expect(isCoverUrl("http://example.com/a.jpg")).toBe(false);
    expect(isCoverUrl("/covers/../secret.jpg")).toBe(false);
  });
});
