import { pageLocale, toast } from "@/lib/toast";

const DEFAULTS = {
  en: { success: "Copied", failure: "Could not copy. Select the text and copy it instead." },
  ar: { success: "تم النسخ", failure: "تعذّر النسخ. حدّد النص وانسخه يدويًا." },
};

/** Low-level clipboard write. Caller chooses its own toast and translated fallback. */
export async function writeClipboardText(text: string, unavailable = "Clipboard unavailable"): Promise<void> {
  if (typeof navigator.clipboard?.writeText !== "function") throw new Error(unavailable);
  await navigator.clipboard.writeText(text);
}

/** Copies text and confirms with a toast, so every Copy button reports the same way. Resolves to whether it worked. */
export async function copyText(text: string, labels: { success?: string; failure?: string } = {}): Promise<boolean> {
  const copy = DEFAULTS[pageLocale()];
  try {
    await writeClipboardText(text);
    toast.success(labels.success ?? copy.success, { id: "clipboard" });
    return true;
  } catch {
    toast.error(labels.failure ?? copy.failure, { id: "clipboard" });
    return false;
  }
}
