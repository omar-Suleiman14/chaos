"use client";
import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: { prompt: "Drop a file here or browse", active: "Release to add file", type: "Unsupported file type.", size: "This file is too large.", count: "Drop one file at a time." },
  ar: { prompt: "اسحب ملفًا هنا أو اختره", active: "اترك الملف لإضافته", type: "نوع الملف غير مدعوم.", size: "الملف كبير جدًا.", count: "أضف ملفًا واحدًا كل مرة." },
};
export type FileDropError = "type" | "size" | "count";
export const acceptsFile = (file: File, accept: string) =>
  accept.split(",").map(rule => rule.trim().toLowerCase()).some(rule =>
    rule.startsWith(".") ? file.name.toLowerCase().endsWith(rule)
      : rule.endsWith("/*") ? file.type.toLowerCase().startsWith(rule.slice(0, -1))
      : !!file.type && file.type.toLowerCase() === rule);

/** Magnetism is for dragged desktop files only: no hover drift, no global listeners. */
export default function MagneticFileDropZone({ accept, onFile, onReject, maxBytes, disabled = false, label, selectedName, compact = false }: {
  accept: string; onFile: (file: File) => void | Promise<void>; onReject?: (reason: FileDropError) => void;
  maxBytes?: number; disabled?: boolean; label?: string; selectedName?: string; compact?: boolean;
}) {
  const t = useCopy(copy);
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");
  const reset = () => { dragDepth.current = 0; setActive(false); setPosition({ x: 0, y: 0 }); };
  const fileDrag = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes("Files");
  const reject = (reason: FileDropError) => { setError(t[reason]); onReject?.(reason); };
  const receive = (file: File) => {
    setError("");
    if (!acceptsFile(file, accept)) { reject("type"); return; }
    if (maxBytes !== undefined && file.size > maxBytes) { reject("size"); return; }
    void onFile(file);
  };
  return (
    <div className="ws-file-drop" data-testid="magnetic-file-drop" data-active={active || undefined}
      data-compact={compact || undefined}
      style={{ "--magnetic-x": `${position.x}px`, "--magnetic-y": `${position.y}px` } as React.CSSProperties}
      onDragEnter={event => { if (!disabled && fileDrag(event)) { event.preventDefault(); dragDepth.current++; setActive(true); } }}
      onDragOver={event => {
        if (disabled || !fileDrag(event)) return;
        event.preventDefault(); event.dataTransfer.dropEffect = "copy";
        if (!active) setActive(true);
        const rect = event.currentTarget.getBoundingClientRect();
        setPosition({ x: Math.max(-6, Math.min(6, (event.clientX - rect.left - rect.width / 2) * 0.06)),
          y: Math.max(-6, Math.min(6, (event.clientY - rect.top - rect.height / 2) * 0.06)) });
      }}
      onDragLeave={event => { if (disabled || !fileDrag(event)) return; event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) reset(); }}
      onDrop={event => {
        if (disabled || !fileDrag(event)) return;
        event.preventDefault(); event.stopPropagation(); reset();
        if (event.dataTransfer.files.length !== 1) { reject("count"); return; }
        receive(event.dataTransfer.files[0]);
      }}>
      <input ref={input} className="sr-only" tabIndex={-1} type="file" accept={accept} disabled={disabled}
        onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) receive(file); }} />
      <button type="button" className="ws-file-drop__button" disabled={disabled} onClick={() => input.current?.click()}>
        <FileUp size={17} aria-hidden="true" />
        <span>{active ? t.active : label ?? t.prompt}</span>
        {selectedName && <small dir="auto">{selectedName}</small>}
      </button>
      {error && <p className="ws-file-drop__error" role="alert">{error}</p>}
    </div>
  );
}
