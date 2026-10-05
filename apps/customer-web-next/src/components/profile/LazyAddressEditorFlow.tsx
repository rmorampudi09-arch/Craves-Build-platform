"use client";

import { useEffect, useRef, useState } from "react";
import { captureSessionContext, isSessionContextCurrent, subscribeSession } from "@/services/auth/cravesAuth";
import { loadAddressEditor, type AddressEditor, type AddressEditorProps } from "./address-editor-loader";

export function LazyAddressEditorFlow(props: AddressEditorProps) {
  const { onClose } = props;
  const [Editor, setEditor] = useState<AddressEditor | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const context = useRef(captureSessionContext());

  useEffect(() => subscribeSession(() => {
    if (!isSessionContextCurrent(context.current)) onClose();
  }), [onClose]);

  useEffect(() => {
    let active = true;
    const current = context.current;
    void loadAddressEditor().then((component) => {
      if (active && isSessionContextCurrent(current)) setEditor(() => component);
    }).catch(() => { if (active && isSessionContextCurrent(current)) setFailed(true); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    if (Editor || !dialog.current) return;
    const surface = dialog.current;
    const previousFocus = document.activeElement;
    if (typeof surface.showModal === "function") surface.showModal();
    else surface.setAttribute("open", "");
    return () => {
      if (typeof surface.close === "function") surface.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [Editor]);

  if (Editor) return <Editor {...props} onSaved={(saved) => {
    if (isSessionContextCurrent(context.current)) return props.onSaved(saved);
  }} />;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="address-form-loading-title"
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-[#E5E7EB] bg-white p-6 text-[#1A1A1A] shadow-xl backdrop:bg-black/30 backdrop:backdrop-blur-sm"
      onCancel={(event) => { event.preventDefault(); props.onClose(); }}
    >
      <h2 id="address-form-loading-title" className="text-xl font-bold">Your address</h2>
      {failed ? (
        <>
          <p role="alert" className="mt-3 text-sm">We couldn’t open the address form. Please try again.</p>
          <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }} className="mt-5 min-h-11 rounded-full bg-[#F62E18] px-5 text-sm font-bold text-white">Try again</button>
        </>
      ) : <p role="status" className="mt-3 text-sm">Preparing your address form…</p>}
      <button type="button" onClick={props.onClose} className="ml-3 mt-5 min-h-11 rounded-full bg-[#F1F3F5] px-5 text-sm font-bold">Close address form</button>
    </dialog>
  );
}
