"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ArrowLeftRight, LifeBuoy, Lock, LogOut, RefreshCw, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/overlays/dropdown-menu";
import { useChefWorkspace } from "@/features/chef/components/chef-workspace-navigation";
import { clearChefMode } from "@/features/chef/lib/chef-mode";
import { getChefName, subscribeChefName, type ChefName } from "@/features/chef/lib/chef-name";
import { CUSTOMERS_LAUNCHING_SOON } from "@/features/sign-in/lib/customer-launch";
import { clearSession, getSession, subscribeSession, synchronizeSessionRoles } from "@/features/auth/api/cravesAuth";

/**
 * The only way from Chef Mode to customer screens; the full load leaves no chef state behind.
 * Until the customer launch, chefs stay in Chef Mode and see the launching-soon note. After it, the
 * customer app opens at once: only this tab leaves Chef Mode, and the device still opens the kitchen.
 */
export function switchToCustomerApp() {
  // Customer launch lock: chefs stay in Chef Mode and see the launching-soon note (see customer-launch.ts).
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load drops every chef screen
  if (CUSTOMERS_LAUNCHING_SOON) return window.location.assign("/sign-in?from=chef");
  clearChefMode();
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load drops every chef screen
  window.location.assign("/home");
}

/** Signs out of Craves, and this device forgets Chef Mode; replace() keeps chef pages out of Back history. */
export function useChefSignOut() {
  const [state, setState] = useState({ busy: false, error: "" });
  async function signOut() {
    if (state.busy) return;
    setState({ busy: true, error: "" });
    try {
      await clearSession();
      window.location.replace("/");
    } catch (error) {
      setState({
        busy: false,
        error: error instanceof Error ? error.message : "Sign-out could not be confirmed. Please try again.",
      });
    }
  }
  return { ...state, signOut };
}

/**
 * For chef access that still looks out of date after the automatic re-check: "Try again" re-reads
 * the session's roles (one refresh) and reloads the screen. Never a new OTP; "Get help" reaches Craves.
 */
export function ChefAccessRetry({ onRetry }: { onRetry: () => unknown }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        className="chef-btn is-primary"
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          await synchronizeSessionRoles().catch(() => null);
          setBusy(false);
          onRetry();
        }}
      >
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
        Try again
      </button>
      <Link href="/chef/support" className="chef-btn">
        <LifeBuoy className="h-4 w-4" aria-hidden="true" />
        Get help
      </Link>
    </div>
  );
}

/** Initials from the chef's application name; nothing from the customer profile or the phone. */
function initials(name: ChefName | null): string {
  return [name?.firstName, name?.lastName]
    .map((part) => part?.trim().match(/^\p{L}/u)?.[0] ?? "")
    .join("")
    .toUpperCase();
}

const ITEM =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#1A1A1A] outline-none focus:bg-[#F1F3F5] data-[highlighted]:bg-[#F1F3F5] data-[disabled]:opacity-60 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-[#6B6B6B]";

/** Avatar menu in the Chef Mode header, also shown to applicants so they are never stranded. */
export function ChefAccountMenu() {
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  const chef = useSyncExternalStore(subscribeChefName, () => getChefName(user?.id), () => null);
  const { busy, error, signOut } = useChefSignOut();
  // Applicants have no chef pages yet: their menu keeps only switching and signing out.
  const { workspace } = useChefWorkspace();
  if (!user) return null;
  const letters = initials(chef);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full !border-0 !bg-[#F1F3F5] text-sm font-bold !text-[#1A1A1A] !shadow-none"
      >
        {letters || <UserRound className="h-5 w-5" aria-hidden="true" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-72 rounded-2xl border border-[#E5E7EB] bg-white p-2 text-[#1A1A1A] shadow-[0_12px_32px_rgba(26,26,26,0.12)]"
      >
        <div className="px-3 py-2">
          <p className="truncate text-sm font-bold">{chef?.firstName || "Your chef account"}</p>
          <p className="truncate text-xs text-[#6B6B6B]">Craves chef</p>
        </div>
        {workspace ? (
          <>
            <DropdownMenuItem className={ITEM} asChild>
              <Link href="/chef/support">
                <LifeBuoy aria-hidden="true" />
                Help & support
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className={ITEM} asChild>
              <Link href="/chef/security">
                <Lock aria-hidden="true" />
                Login & security
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuItem className={ITEM} onSelect={switchToCustomerApp}>
          <ArrowLeftRight aria-hidden="true" />
          Switch to customer app
        </DropdownMenuItem>
        <DropdownMenuItem
          className={ITEM}
          disabled={busy}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          <LogOut aria-hidden="true" />
          {busy ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
        {error ? (
          <p role="alert" className="px-3 py-2 text-xs font-medium text-[#C4200F]">
            {error}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
