"use client";

import { useEffect, useImperativeHandle, useRef, type ComponentPropsWithRef } from "react";

/** Focus newly opened editing controls after mount, without scrolling the page. */
export function FocusInput({ focusOnMount, ref, ...props }: ComponentPropsWithRef<"input"> & { focusOnMount?: boolean }) {
  const control = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => control.current!, []);
  useEffect(() => { if (focusOnMount) control.current?.focus({ preventScroll: true }); }, [focusOnMount]);
  return <input {...props} ref={control} />;
}

export function FocusTextarea({ focusOnMount, ref, ...props }: ComponentPropsWithRef<"textarea"> & { focusOnMount?: boolean }) {
  const control = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => control.current!, []);
  useEffect(() => { if (focusOnMount) control.current?.focus({ preventScroll: true }); }, [focusOnMount]);
  return <textarea {...props} ref={control} />;
}

export function FocusButton({ focusOnMount, ref, ...props }: ComponentPropsWithRef<"button"> & { focusOnMount?: boolean }) {
  const control = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => control.current!, []);
  useEffect(() => { if (focusOnMount) control.current?.focus({ preventScroll: true }); }, [focusOnMount]);
  return <button {...props} ref={control} />;
}
