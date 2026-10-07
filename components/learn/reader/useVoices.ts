"use client";
import { useEffect, useState } from "react";
import { loadVoices } from "@/lib/learn/narration/voices";
import { speechSupported } from "@/lib/learn/narration/support";

/** The device's speech voices, kept current as the engine loads or changes them. Empty without speech. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!speechSupported()) return;
    const synth = window.speechSynthesis;
    let live = true;
    const update = () => { if (live) setVoices(synth.getVoices()); };
    void loadVoices(synth).then((v) => { if (live) setVoices(v); });
    synth.addEventListener?.("voiceschanged", update);
    return () => { live = false; synth.removeEventListener?.("voiceschanged", update); };
  }, []);
  return voices;
}
