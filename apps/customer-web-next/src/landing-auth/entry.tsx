import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AuthModal } from "@/components/auth/AuthModal";
import { loadSession } from "@/services/auth/cravesAuth";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let opening = false;

function CustomerAuth({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  useEffect(() => {
    const landing = document.getElementById("root");
    const wasInert = landing?.inert ?? false;
    const overflow = document.body.style.overflow;
    if (landing) landing.inert = true;
    document.body.style.overflow = "hidden";
    const focus = () => host?.querySelector<HTMLButtonElement>('button[aria-label="Close sign-in dialog"]')?.focus();
    focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !host?.contains(document.activeElement)) return;
      const controls = Array.from(host.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]'))
        .filter((element) => element.getClientRects().length > 0);
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      if (landing) landing.inert = wasInert;
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", trapFocus);
    };
  }, []);
  return <AuthModal open mode={mode} initialAccountMode="customer" lockAccountMode={false}
    onClose={onClose} onSwitchMode={setMode}
    onAuthenticated={(user, role) => {
      window.location.assign(role === "chef"
        ? user.roles.some((value) => value.toUpperCase() === "CHEF") ? "/chef" : "/chef/application"
        : "/home");
    }} />;
}

/** Built from the same AuthModal and Firebase configuration as the customer app. */
export async function openLandingAuth() {
  if (root || opening) return;
  opening = true;
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current = await Promise.race([
      loadSession(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Sign-in took too long to open.")), 15000); }),
    ]).finally(() => clearTimeout(timer));
    // The standalone landing document has no Next router; navigation must load the application.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (current) { window.location.assign("/home"); return; }
    host = document.createElement("div");
    host.id = "craves-customer-auth";
    document.body.append(host);
    root = createRoot(host);
    const close = () => {
      // Unmount after the modal's own reset callback has finished.
      queueMicrotask(() => {
        root?.unmount(); root = null;
        host?.remove(); host = null;
        trigger?.focus({ preventScroll: true });
      });
    };
    root.render(<CustomerAuth onClose={close} />);
  } finally { opening = false; }
}
