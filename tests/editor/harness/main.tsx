/* Mounts the real LessonEditor in a page shaped like the lesson dashboard's writing canvas
   (app/[lang]/(app)/dashboard/learn/lessons/[id]/page.tsx) so Playwright can drive real pointer,
   keyboard and clipboard input. Query: ?doc=en|ar&ui=en|ar&theme=light|dark&fixture=basic|empty|long */
import "@/app/globals.css";
import "@/app/workspace.css";
import "@/components/learn/learn.css";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/components/ThemeProvider";
import LessonEditor from "@/components/learn/editor/LessonEditor";
import type { LessonEditorType } from "@/components/learn/editor/blocks";
import { lessonEditorContent } from "@/perf/lib/lessonEditorContent";
import { harnessFixture } from "./fixtures";
import { focusLessonStart } from "@/components/learn/editor/focusEnd";

const params = new URLSearchParams(location.search);
const doc = params.get("doc") === "ar" ? "ar" : "en";
const ui = params.get("ui") === "ar" ? "ar" : "en";
const fixture = params.get("fixture") ?? "basic";
if (params.get("theme") === "dark") document.documentElement.classList.add("dark");
document.documentElement.lang = ui;
document.documentElement.dir = ui === "ar" ? "rtl" : "ltr";

declare global {
  interface Window { __editor?: LessonEditorType; __changes: unknown[][]; __events: string[] }
}
window.__changes = [];
window.__events = [];

const initial = fixture === "empty" ? [] : fixture === "long" ? lessonEditorContent(Number(params.get("size") ?? 200), doc) : harnessFixture(doc, fixture === "all");

function Page() {
  const [title, setTitle] = useState(fixture === "empty" ? "" : doc === "ar" ? "الدورة الدموية" : "Circulation basics");
  return (
    <div className="lx-edit">
      <div className="lx-edit__body" data-panel="closed">
        <div className="lx-edit__doc" dir={doc === "ar" ? "rtl" : "ltr"} lang={doc}>
          <textarea className="lx-title-input" rows={1} value={title} placeholder="Untitled" aria-label="Title" onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); focusLessonStart(window.__editor); } }} />
          <textarea className="lx-desc-input" rows={1} placeholder="Add a short description" aria-label="Description" />
          <LessonEditor initialContent={initial} language={doc} sources={[{ id: "src1", kind: "pdf", title: "Lecture 8 slides" } as never]}
            onChange={(content) => window.__changes.push(content)}
            onManageSources={() => window.__events.push("sources")}
            onEditImage={(id) => window.__events.push(`image:${id}`)}
            onEditCitation={(id) => window.__events.push(`cite:${id}`)}
            onAssist={(r) => window.__events.push(`assist:${r.action}`)}
            onUploadError={(m) => window.__events.push(`upload-error:${m}`)}
            onReady={(editor) => { window.__editor = editor; }}
            uploadFile={async (file) => URL.createObjectURL(file)}
            resolveFileUrl={async (url) => url} />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><LocaleProvider initial={ui}><ThemeProvider><Page /></ThemeProvider></LocaleProvider></StrictMode>,
);
