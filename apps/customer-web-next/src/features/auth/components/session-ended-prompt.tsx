"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { getSession } from "@/features/auth/api/cravesAuth";
import { BEFORE_SIGN_IN_EVENT, SESSION_ENDED_EVENT } from "@/shared/lib/session-fetch";
import { Sheet } from "@/shared/ui/overlays/overlay";

/** Pages that sign people in themselves, or keep their own (administrator) sessions. */
const OWN_SIGN_IN = ["/sign-in", "/chef/sign-in", "/admin"];

/**
 * When a signed-in customer's or chef's sign-in ends mid-task, say why and offer one way on:
 * Sign in again (a fresh OTP), which brings them back to this same page. It can't be dismissed:
 * nothing that needs the account works until they do.
 */
export function SessionEndedPrompt() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    // Only someone who was signed in; a guest's refused refresh is not an ended sign-in.
    const ended = () => {
      if (getSession()) setOpen(true);
    };
    window.addEventListener(SESSION_ENDED_EVENT, ended);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, ended);
  }, []);
  const ownSignIn = OWN_SIGN_IN.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  // Once a sign-in page takes over, the prompt has done its job: a guest who leaves that page
  // (or someone who signs in there without a reload) never sees it again.
  if (open && ownSignIn) setOpen(false);
  if (ownSignIn) return null;
  const chef = pathname === "/chef" || pathname.startsWith("/chef/");

  function signInAgain() {
    setLeaving(true);
    // Open forms keep what was typed, and get it back after the sign-in.
    window.dispatchEvent(new Event(BEFORE_SIGN_IN_EVENT));
    const here = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    // A full load starts the new sign-in clean.
    window.location.assign(chef ? `/chef/sign-in?returnTo=${here}` : `/sign-in?returnTo=${here}`);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      dismissible={false}
      title="Please sign in again"
      description={
        chef
          ? "For your safety, Craves signs you out after some time. Everything you’ve saved is kept. Confirm your phone number with an OTP and you’ll come back to this page."
          : "For your safety, Craves signs you out after some time. Your cart and orders are kept. Confirm your phone number with an OTP and you’ll come back to this page."
      }
      footer={
        <button type="button" className="craves-primary-action w-full" aria-busy={leaving} disabled={leaving} onClick={signInAgain}>
          <LogIn className="h-5 w-5" aria-hidden="true" />
          {leaving ? "Opening sign-in…" : "Sign in again"}
        </button>
      }
    />
  );
}
