"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SelectHTMLAttributes } from "react";
import { Select } from "./Select";
import { optionsFrom } from "./selectOptions";

type Change = { target: { value: string }; currentTarget: { value: string } };
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value" | "defaultValue" | "size" | "multiple"> & {
  focusOnMount?: boolean;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (event: Change) => void;
};

/** Keeps existing option markup and value callbacks while using the Chaos listbox. */
export function ChaosSelect({ children, value, defaultValue, onChange, name, required, disabled, id, className, form, focusOnMount, ...attributes }: Props) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const options = optionsFrom(children);
  const initial = String(defaultValue ?? options.find(option => !option.disabled)?.value ?? "");
  const [localValue, setLocalValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const current = value === undefined ? localValue : String(value);
  // Uncontrolled controls follow options arriving asynchronously, like native selects.
  const chosen = value === undefined && !options.some(option => option.value === current) ? options.find(option => !option.disabled)?.value ?? "" : current;
  useEffect(() => {
    const owner = input.current?.form;
    const reset = () => { setLocalValue(initial); setInvalid(false); };
    owner?.addEventListener("reset", reset);
    return () => owner?.removeEventListener("reset", reset);
  }, [initial]);

  useEffect(() => { if (focusOnMount) document.getElementById(triggerId)?.focus({ preventScroll: true }); }, [focusOnMount, triggerId]);

  const label = attributes["aria-label"];
  const labelledBy = attributes["aria-labelledby"];
  return <>
    <Select id={triggerId} label={label} labelledBy={labelledBy} value={chosen} options={options} disabled={disabled} className={className}
      triggerProps={{ ...attributes as React.ButtonHTMLAttributes<HTMLButtonElement>, form, "aria-required": required || undefined, "aria-invalid": invalid || attributes["aria-invalid"] }}
      onChange={next => { setLocalValue(next); setInvalid(false); onChange?.({ target: { value: next }, currentTarget: { value: next } }); }} />
    {/* A text input participates in FormData and browser required validation; the button remains the sole accessible control. */}
    <input ref={input} type="text" name={name} form={form} value={chosen} required={required} disabled={disabled} readOnly={!required} aria-hidden="true" tabIndex={-1}
      style={{ position: "absolute", width: 1, height: 1, padding: 0, border: 0, opacity: 0, pointerEvents: "none" }}
      onChange={() => {}}
      onInvalid={event => { event.preventDefault(); setInvalid(true); document.getElementById(triggerId)?.focus(); }} />
  </>;
}
