import { describe, expect, it } from "vitest";
import { checkLessonImage, isLessonLinkAllowed, LESSON_IMAGE_MAX_BYTES, normalizeEditorLinks, normalizeLessonLink, sanitizeClipboardHtml } from "@/lib/learn/editorPolicy";
import { MEDIA_MAX_BYTES } from "@/lib/learn/mediaClient";
import { safeLessonLink } from "@/convex/learnValidation";

describe("lesson links", () => {
  it("keeps web and email links, adds https:// to bare addresses", () => {
    expect(normalizeLessonLink("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(normalizeLessonLink("mailto:teacher@example.com")).toBe("mailto:teacher@example.com");
    expect(normalizeLessonLink("example.com/page")).toBe("https://example.com/page");
    expect(normalizeLessonLink("  www.example.org  ")).toBe("https://www.example.org");
  });

  it.each(["javascript:alert(1)", "JAVASCRIPT:alert(1)", " javascript:alert(1)", "data:text/html,<script>", "vbscript:x", "tel:+123", "ftp://example.com", "file:///etc/passwd", "/relative", "#top", "https://user:pw@example.com", "https://exa mple.com", "", "notalink"])("refuses %j", (href) => {
    expect(normalizeLessonLink(href)).toBeNull();
    expect(isLessonLinkAllowed(href)).toBe(false);
  });

  it("only ever produces links the server accepts", () => {
    for (const href of ["example.com", "https://a.b/c", "mailto:a@b.co", "sub.example.co.uk/x#y"]) {
      const out = normalizeLessonLink(href);
      expect(out && safeLessonLink(out)).toBe(true);
    }
  });

  it("turns unstorable links into text, recursively and inside tables", () => {
    const blocks = [
      { id: "a", type: "paragraph", props: {}, content: [{ type: "text", text: "Go " }, { type: "link", href: "javascript:x", content: [{ type: "text", text: "here" }] }, { type: "link", href: "example.com", content: [{ type: "text", text: "site" }] }], children: [
        { id: "b", type: "paragraph", props: {}, content: [{ type: "link", href: "tel:1", content: [{ type: "text", text: "call" }] }], children: [] },
      ] },
      { id: "t", type: "table", props: {}, content: { type: "tableContent", rows: [{ cells: [[{ type: "link", href: "ftp://x.y", content: [{ type: "text", text: "f" }] }]] }] }, children: [] },
    ];
    const { blocks: out, removed } = normalizeEditorLinks(blocks);
    expect(removed).toBe(3);
    expect(out[0].content).toEqual([{ type: "text", text: "Go " }, { type: "text", text: "here" }, { type: "link", href: "https://example.com", content: [{ type: "text", text: "site" }] }]);
    expect((out[0].children[0] as { content: unknown }).content).toEqual([{ type: "text", text: "call" }]);
    expect((out[1].content as { rows: { cells: unknown[][] }[] }).rows[0].cells[0]).toEqual([{ type: "text", text: "f" }]);
    expect((blocks[0].content as unknown[])[1]).toMatchObject({ type: "link" }); // input untouched
  });

  it("returns the same array when nothing changes (no extra saves)", () => {
    const blocks = [{ id: "a", type: "paragraph", props: {}, content: [{ type: "link", href: "https://ok.example", content: [] }], children: [] }];
    expect(normalizeEditorLinks(blocks).blocks).toBe(blocks);
  });
});

describe("lesson image uploads", () => {
  it("matches the source upload limit", () => expect(LESSON_IMAGE_MAX_BYTES).toBe(MEDIA_MAX_BYTES));
  it("checks type, size and emptiness before uploading", () => {
    expect(checkLessonImage({ type: "image/png", size: 10 })).toBeNull();
    expect(checkLessonImage({ type: "IMAGE/JPEG", size: 10 })).toBeNull();
    expect(checkLessonImage({ type: "image/webp", size: LESSON_IMAGE_MAX_BYTES })).toBeNull();
    expect(checkLessonImage({ type: "image/webp", size: LESSON_IMAGE_MAX_BYTES + 1 })).toBe("size");
    expect(checkLessonImage({ type: "image/svg+xml", size: 10 })).toBe("type");
    expect(checkLessonImage({ type: "image/gif", size: 10 })).toBe("type");
    expect(checkLessonImage({ type: "application/pdf", size: 10 })).toBe("type");
    expect(checkLessonImage({ type: "image/png", size: 0 })).toBe("empty");
  });
});

describe("clipboard HTML", () => {
  it("cleans Word and Google Docs markup", () => {
    const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{mso-style:x}</style><meta name=Generator></head><body>
      <!--[if gte mso 9]><xml><o:OfficeDocumentSettings/></xml><![endif]-->
      <p class="MsoNormal" style="mso-line-height:12pt;color:red" onclick="steal()"><b style="font-weight:700">Bold</b> text<o:p></o:p></p>
      <h2 class="x" id="y">Heading</h2><script>alert(1)</script><iframe src="https://evil.example"></iframe>
      <p><a href="javascript:alert(1)" onmouseover="x()">bad link</a> <a href="example.com" target="_blank" style="x">good</a></p>
      <img src="https://cdn.example/a.png" alt="A"><video src="v.mp4"></video><form><input value="x"></form></body></html>`;
    const out = sanitizeClipboardHtml(word);
    expect(out.html).not.toMatch(/script|iframe|onclick|onmouseover|style=|class=|mso|o:p|<img|<video|<form|<input|javascript|<!--/i);
    expect(out.html).toContain("<b>Bold</b> text");
    expect(out.html).toContain("<h2>Heading</h2>");
    expect(out.html).toContain('<a href="https://example.com">good</a>');
    expect(out.html).toContain("bad link");
    expect(out).toMatchObject({ removedImages: 1, removedMedia: 2, removedLinks: 1 });
  });

  it("flattens formatting inside table cells (lesson tables store plain text)", () => {
    const out = sanitizeClipboardHtml("<table><tr><th><b>Chamber</b></th><td><p>Left</p><p>ventricle</p></td><td><a href='https://x.example'>link</a></td></tr></table>");
    expect(out.html).toMatch(/<th>Chamber<\/th>/);
    expect(out.html).toMatch(/<td>Left ventricle\s*<\/td>/);
    expect(out.html).toMatch(/<td>link<\/td>/);
  });

  it("keeps Arabic and mixed-direction text intact", () => {
    const out = sanitizeClipboardHtml('<p dir="rtl">القلب <span style="x">heart</span> ٢٣</p>');
    expect(out.html).toContain("القلب");
    expect(out.html).toContain("heart");
    expect(out.html).toContain("٢٣");
  });
});
