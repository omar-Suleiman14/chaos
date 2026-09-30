"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import posthog from "@/lib/analytics";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/errors";
import { emptyDefinition } from "@/convex/formLogic";
import { themeFromPreset } from "@/components/forms/formThemes";
import { useCopy } from "@/lib/i18n";
import { defaultPreferences, readPreferences } from "@/lib/preferences";

/** Only send a definition when the creator changed a default; otherwise the server's blank is the same. */
function hasCustomDefaults() {
  const p = readPreferences();
  return (Object.keys(defaultPreferences) as (keyof typeof defaultPreferences)[])
    .filter((k) => k.startsWith("newForm"))
    .some((k) => p[k] !== defaultPreferences[k]);
}

const copy = { en: { failed: "It could not be created. Please try again." }, ar: { failed: "تعذّر الإنشاء. حاول مرة أخرى." } };

/** A blank form built from the creator's defaults in Settings → New forms. */
function blankFromPreferences() {
  const p = readPreferences();
  const def = emptyDefinition();
  def.presentation = p.newFormMode;
  def.defaultLanguage = p.newFormLanguage;
  def.languages = [p.newFormLanguage];
  def.theme = { ...themeFromPreset(p.newFormPreset), sound: p.newFormSound ? (themeFromPreset(p.newFormPreset).sound ?? "soft") : "off" };
  if (p.newFormSound && def.theme.sound === "off") def.theme.sound = "soft";
  return def;
}

type CreateArgs = Parameters<ReturnType<typeof useMutation<typeof api.forms.createForm>>>[0];

/**
 * Create a draft from a blank page, template/import or the Games entry point,
 * then open the shared builder. Games use quiz mode in the same content model.
 */
export function useCreateForm(onError: (message: string) => void) {
  const t = useCopy(copy);
  const router = useRouter();
  const createForm = useMutation(api.forms.createForm);
  const [busy, setBusy] = useState(false);

  const create = async (args: CreateArgs = {}) => {
    if (busy) return;
    setBusy(true);
    try {
      const blank = !args.definition && !args.templateId && !args.ownTemplateId && hasCustomDefaults();
      const formId = await createForm(blank ? { ...args, definition: blankFromPreferences() } : args);
      posthog.capture("form_created", {
        source: args.templateId ? "template" : args.ownTemplateId ? "saved_template" : "blank",
        uses_custom_defaults: blank,
      });
      router.push(`/dashboard/forms/${formId}`);
    } catch (err) {
      onError(errorMessage(err, t.failed));
    } finally {
      setBusy(false);
    }
  };

  return { create, busy };
}
