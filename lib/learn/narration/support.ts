/** Whether this browser exposes Web Speech synthesis. Kept tiny: the reader imports it on first load. */
export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

/**
 * iOS Safari only lets a page start speech from a user gesture. Narration loads its code
 * asynchronously, so the click that starts it speaks a silent space first to unlock speech.
 */
export function primeSpeech() {
  if (!speechSupported()) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch { /* engine refused: narration reports its own error */ }
}
