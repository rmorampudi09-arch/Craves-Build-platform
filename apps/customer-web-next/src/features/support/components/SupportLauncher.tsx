"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { getSession, loadSession, subscribeSession, type CravesUser } from "@/features/auth/api/cravesAuth";
import { AssistantAvatar, SupportChat, type SupportChatRole } from "./SupportChat";

// These pages already show the chat (/assistant is the chat itself, framed by the landing page), or are admin.
const HIDDEN_PATH_PREFIXES = ["/support", "/chef/support", "/assistant", "/admin"];
// The customer app keeps the assistant on Profile only, so it never sits over dishes, the cart or Pay.
const CUSTOMER_APP_PREFIXES = [
  "/home", "/search", "/discover", "/chefs", "/kitchen", "/kitchens", "/dish", "/food", "/cart", "/checkout", "/payment",
  "/confirmation", "/orders", "/tracking", "/wishlist", "/notifications", "/settings", "/addresses", "/refer", "/subscriptions", "/help",
];

/**
 * The chef workspace has Help in its header (and the chat inside it), so the floating button would only
 * cover dish switches and order buttons there. Sign-in and the application keep it.
 */
export function hidesSupportLauncher(pathname: string): boolean {
  const under = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (HIDDEN_PATH_PREFIXES.some(under) || CUSTOMER_APP_PREFIXES.some(under)) return true;
  return (pathname === "/chef" || pathname.startsWith("/chef/")) && pathname !== "/chef/sign-in" && !pathname.startsWith("/chef/application");
}

/** Signed-out visitors get the guest assistant; on chef pages a chef chats as their kitchen. */
export function supportRole(user: CravesUser | null, pathname: string): SupportChatRole {
  if (!user || user.status !== "ACTIVE") return "GUEST";
  const roles = user.roles.map(role => role.toUpperCase());
  const chef = roles.includes("CHEF");
  const customer = roles.includes("CUSTOMER");
  if (chef && (pathname.startsWith("/chef") || !customer)) return "CHEF";
  return customer ? "CUSTOMER" : "GUEST";
}

/** The chat role for whoever is signed in. Checked only once {@code enabled}, so visitors who never chat cost nothing. */
export function useSupportRole(pathname: string, enabled: boolean): SupportChatRole {
  const [role, setRole] = useState<SupportChatRole>("GUEST");
  useEffect(() => {
    if (!enabled) return;
    const update = () => setRole(supportRole(getSession(), pathname));
    update();
    if (!getSession()) void loadSession({ failFastUnauthenticated: true }).catch(() => null).then(update);
    return subscribeSession(update);
  }, [enabled, pathname]);
  return role;
}

/** Height of the fixed bar at the bottom of the screen (tab bar, cart or pay bar), so the button sits above it. */
function useBottomBarHeight(pathname: string): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let top = window.innerHeight;
        document.querySelectorAll<HTMLElement>("[data-craves-bottom-nav], [data-craves-action-bar]").forEach(bar => {
          const box = bar.getBoundingClientRect();
          if (box.height > 0 && getComputedStyle(bar).position === "fixed") top = Math.min(top, box.top);
        });
        setHeight(Math.max(0, Math.round(window.innerHeight - top)));
      });
    };
    measure();
    // Bars come and go with the cart and the page, without a navigation.
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [pathname]);
  return height;
}

/** "Ask Craves": a floating liquid-glass button, bottom right on every page, that opens the support assistant. */
export function SupportLauncher() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  // Mounted on first open and kept, so closing the panel never loses the conversation.
  const [started, setStarted] = useState(false);
  const role = useSupportRole(pathname, started);
  const button = useRef<HTMLButtonElement>(null);
  const bar = useBottomBarHeight(pathname);
  const hidden = hidesSupportLauncher(pathname);

  useEffect(() => {
    if (!open) return;
    document.getElementById("support-chat-input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, role]);

  if (hidden) return null;

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const bottom = bar ? `${bar + 12}px` : "calc(1rem + env(safe-area-inset-bottom))";

  return (
    <div style={{ "--craves-support-bottom": bottom } as CSSProperties}>
      {started ? (
        <section
          id="craves-support-panel"
          role="dialog"
          aria-label="Craves assistant"
          hidden={!open}
          className={`craves-support-glass craves-support-pop fixed inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)] bottom-2 z-[60] flex flex-col overflow-hidden rounded-[1.6rem] sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-[calc(var(--craves-support-bottom)+4.25rem)] sm:h-[min(40rem,calc(100dvh-8rem))] sm:w-[25rem]`}
        >
          <header className="relative z-[2] flex items-center gap-3 px-4 pt-3.5 pb-3">
            <AssistantAvatar size={36} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-bold leading-5 text-[#1A1A1A]">Craves Assistant</h2>
              <p className="truncate text-xs text-[#3A3A3A]">
                {role === "GUEST" ? "Sign-in help, questions and callbacks" : "Orders, payments and finding your way"}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close Craves assistant"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-[#1A1A1A] shadow-[0_1px_4px_rgba(26,26,26,0.12)] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>
          <div className="relative z-[2] mx-2 mb-2 flex min-h-0 flex-1 flex-col rounded-[1.25rem] bg-white px-3 pb-3 shadow-[0_1px_3px_rgba(26,26,26,0.06)]">
            {/* A new chat when who is signed in changes: a visitor's chat must not continue as someone's account. */}
            <SupportChat key={role} contextRole={role} />
          </div>
        </section>
      ) : null}
      <button
        ref={button}
        type="button"
        onClick={() => {
          setStarted(true);
          setOpen(current => !current);
        }}
        aria-expanded={open}
        aria-controls={started ? "craves-support-panel" : undefined}
        aria-label={open ? "Close Craves assistant" : "Questions? Ask Craves assistant"}
        className={`craves-support-glass fixed right-4 bottom-[var(--craves-support-bottom)] z-[45] flex h-12 items-center gap-2 rounded-full px-5 text-[#1A1A1A] transition-[transform,box-shadow] duration-150 hover:shadow-[0_14px_36px_rgba(26,26,26,0.18)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/50 sm:h-14 sm:py-1.5 sm:pr-5 sm:pl-1.5 ${open ? "max-sm:hidden" : ""}`}
      >
        <span className="relative z-[2] hidden h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(26,26,26,0.1)] sm:flex">
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <AssistantAvatar size={30} />}
        </span>
        <span className="relative z-[2] text-[15px] font-bold sm:hidden">Questions?</span>
        <span className="relative z-[2] hidden text-sm font-bold sm:inline">{open ? "Close" : "Ask Craves"}</span>
      </button>
    </div>
  );
}
