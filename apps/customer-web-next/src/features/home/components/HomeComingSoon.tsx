"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, Check, MapPin, RefreshCw, Share2 } from "lucide-react";
import type { CravesAddress } from "@/features/auth/api/cravesAuth";
import { LaunchAlertError, readLaunchAlert, saveLaunchAlert, type LaunchAlertState } from "@/features/home/api/launch-alerts";
import { deliveryPlaceLabel } from "@/features/home/lib/cart-address-availability";
import { comingSoonTitle, LAUNCH_ALERT_AREA_MAX } from "@/features/home/lib/launch-alert-contract";
import { EmptyIllustration } from "@/shared/ui/feedback/EmptyIllustration";
import { emptyStateSecondaryAction } from "@/shared/ui/feedback/EmptyState";

const noSubscription = () => () => {};

/** The short place name the title and the later "Home chefs now cook near …" notice use. */
function areaOf(address: CravesAddress): string {
  return address.mandal?.trim() || address.city?.trim() || deliveryPlaceLabel(address);
}

/**
 * Home when no kitchen cooks near the chosen address (app 1.35.4): only this page, no banner,
 * categories or empty lists. Notify me asks user-chef to say when the first kitchen opens here.
 */
export function HomeComingSoon({
  address,
  addressTypeLabel,
  onChangeAddress,
  onCheckAgain,
}: {
  address: CravesAddress & { lat: number; lng: number };
  addressTypeLabel: string;
  onChangeAddress: () => void;
  onCheckAgain: () => void;
}) {
  const area = areaOf(address);
  const [alert, setAlert] = useState<LaunchAlertState | "loading">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [shareNote, setShareNote] = useState("");
  const canShare = useSyncExternalStore(noSubscription, () => typeof navigator.share === "function", () => false);

  useEffect(() => {
    let active = true;
    setAlert("loading");
    setError("");
    readLaunchAlert({ latitude: address.lat, longitude: address.lng })
      .then((state) => active && setAlert(state))
      // A failed read still offers Notify me; saving says if it fails too.
      .catch(() => active && setAlert("not-subscribed"));
    return () => {
      active = false;
    };
  }, [address.lat, address.lng]);

  async function notify() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      setAlert(await saveLaunchAlert({ latitude: address.lat, longitude: address.lng, areaName: area.slice(0, LAUNCH_ALERT_AREA_MAX) }));
    } catch (failure) {
      setError(failure instanceof LaunchAlertError ? failure.message : "We couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Customers in a new area know its best home cooks; the chef page explains how to join.
  async function inviteCook() {
    const link = `${window.location.origin}/#become-a-chef`;
    const text = `Cook from home and earn with Craves. Customers near ${area} are waiting: ${link}`;
    setShareNote("");
    if (canShare) {
      await navigator.share({ text }).catch(() => undefined); // closing the share sheet is fine
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareNote("Invitation copied. Paste it in WhatsApp or a text.");
    } catch {
      setShareNote(`Copying is unavailable here. Share this link: ${link}`);
    }
  }

  return (
    <section
      aria-labelledby="coming-soon-title"
      className="mx-auto grid min-h-[calc(100dvh-9rem)] max-w-[72rem] items-center gap-6 px-4 py-8 md:px-7 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-10 lg:py-14"
      data-testid="home-coming-soon"
    >
      <div className="flex justify-center lg:order-2">
        <EmptyIllustration name="deliveryBike" className="w-64 sm:w-80 lg:w-[30rem]" />
      </div>

      <div className="mx-auto w-full max-w-md text-center lg:order-1 lg:mx-0 lg:max-w-lg lg:text-left">
        <h1
          id="coming-soon-title"
          className="text-balance font-display text-[2rem] font-bold leading-[1.05] tracking-[-0.035em] text-[#1A1A1A] sm:text-[2.5rem] lg:text-[3.5rem]"
        >
          {comingSoonTitle(area)}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-pretty text-base leading-7 text-[#6B6B6B] lg:mx-0 lg:mt-4 lg:max-w-md lg:text-lg">
          Home chefs don&rsquo;t cook near this address yet. Get a notification when the first kitchen opens here.
        </p>

        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-[#F6F7F8] px-4 py-3 text-left">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FDEAE8] text-[#D92714]">
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm text-[#6B6B6B]">Delivering to {addressTypeLabel}</span>
            <span className="block truncate text-[0.9375rem] font-semibold text-[#1A1A1A]">{deliveryPlaceLabel(address)}</span>
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row lg:justify-start">
          {alert === "subscribed" ? (
            <p
              role="status"
              className="flex min-h-12 flex-1 items-center justify-center gap-2.5 rounded-full bg-[#E8F7F1] px-5 text-[0.9375rem] font-semibold text-[#166B49]"
              data-testid="coming-soon-subscribed"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#29B47B] text-white">
                <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
              </span>
              You&rsquo;ll get a notification when it opens
            </p>
          ) : alert === "unavailable" ? null : (
            <button
              type="button"
              onClick={() => void notify()}
              disabled={saving || alert === "loading"}
              aria-busy={saving}
              className="craves-primary-action flex-1"
              data-testid="coming-soon-notify"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {saving ? "Saving…" : "Notify me"}
            </button>
          )}
          <button type="button" onClick={onChangeAddress} className={`${emptyStateSecondaryAction} flex-1`}>
            <MapPin className="h-5 w-5" aria-hidden="true" />
            Change address
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm font-semibold text-[#C72C21]">
            {error}
          </p>
        ) : null}

        <div className="mt-8 rounded-2xl bg-[#FFF5E9] px-5 py-4 text-left">
          <h2 className="font-display text-base font-bold text-[#261A15]">Know a great home cook near {area.length <= 28 ? area : "you"}?</h2>
          <p className="mt-1 text-sm leading-6 text-[#706864]">
            Invite them to cook on Craves. The first kitchen here could be theirs.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              type="button"
              onClick={() => void inviteCook()}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-[#D92714] transition-colors hover:bg-[#FDEAE8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A]"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Invite a home cook
            </button>
            <button
              type="button"
              onClick={onCheckAgain}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#706864] underline-offset-4 hover:text-[#261A15] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Check again
            </button>
          </div>
          <p role="status" className="mt-2 text-sm text-[#166B49] empty:hidden">
            {shareNote}
          </p>
        </div>
      </div>
    </section>
  );
}
