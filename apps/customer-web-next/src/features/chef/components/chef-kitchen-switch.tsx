"use client";

import Link from "next/link";
import { useState } from "react";
import { LifeBuoy, Store } from "lucide-react";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import { ChefError, chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";
import type { ChefKitchen, ChefKitchenInput } from "@/features/chef/lib/chef-kitchen-types";
import { sessionFetch } from "@/features/auth/api/sessionFetch";

/** The saved kitchen with only open/closed changed: the same body the kitchen form saves. Nothing else is filled in. */
export function kitchenWithStatus(kitchen: ChefKitchen, status: "ACTIVE" | "INACTIVE"): ChefKitchenInput {
  return {
    kitchenName: kitchen.kitchenName,
    displayName: kitchen.displayName,
    description: kitchen.description,
    phoneNumber: kitchen.phoneNumber?.trim() || null,
    email: kitchen.email,
    addressLine1: kitchen.addressLine1,
    addressLine2: kitchen.addressLine2,
    landmark: kitchen.landmark,
    areaName: kitchen.areaName,
    city: kitchen.city,
    state: kitchen.state,
    postalCode: kitchen.postalCode,
    latitude: kitchen.latitude,
    longitude: kitchen.longitude,
    status,
  };
}

/** Open or close the kitchen in one tap, the most common daily change, without the setup steps. */
export function ChefKitchenSwitch({
  kitchen,
  onChange,
}: {
  kitchen: ChefKitchen;
  onChange(kitchen: ChefKitchen): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const suspended = kitchen.status === "SUSPENDED";
  const open = kitchen.status === "ACTIVE";

  async function setOpen(next: boolean) {
    if (busy || suspended) return;
    setBusy(true);
    setError("");
    try {
      // Start from the kitchen as saved now: the page may have been open for hours, and an
      // edit made elsewhere since then must not be written back over.
      const latestResponse = await sessionFetch("/api/chef/kitchen", { cache: "no-store" });
      const latest = latestResponse.ok ? parseChefKitchen(await latestResponse.json().catch(() => null)) : null;
      if (!latest) throw chefApiError(latestResponse, null, "We couldn’t check your kitchen. Try again.");
      if (latest.status === "SUSPENDED") {
        onChange(latest);
        return;
      }
      const response = await sessionFetch("/api/chef/kitchen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitchenWithStatus(latest, next ? "ACTIVE" : "INACTIVE")),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw chefApiError(
          response,
          body,
          next
            ? "Your kitchen didn’t open. Check its pickup address and phone, then try again."
            : "Your kitchen didn’t close. Try again.",
        );
      }
      const saved = parseChefKitchen(body);
      if (!saved) throw new ChefError("We couldn’t confirm the change. Refresh to check your kitchen.", "INVALID_KITCHEN_RESPONSE", response.status);
      onChange(saved);
    } catch (caught) {
      setError(chefErrorText(caught, "That didn’t save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`chef-kitchen-switch${open ? " is-open" : ""}`} aria-labelledby="chef-kitchen-switch-title" aria-busy={busy}>
      <div className="flex items-center gap-3.5">
        <span className="chef-kitchen-switch-icon">
          <Store className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="chef-kitchen-switch-title" className="chef-kitchen-switch-title">
            {suspended ? "Kitchen paused by Craves" : open ? "Kitchen open" : "Kitchen closed"}
          </h2>
          <p className="chef-section-note mt-0.5 !text-[0.9375rem]">
            {suspended
              ? "Customers can’t order right now."
              : open
                ? "Customers can order now."
                : "Customers can’t order. Open it when you’re ready to cook."}
          </p>
        </div>
        <AppleSwitch
          checked={open}
          disabled={suspended}
          aria-disabled={busy || undefined}
          onCheckedChange={(next) => void setOpen(next)}
          size="lg"
          tone="go"
          aria-label="Kitchen open"
        />
      </div>
      {suspended ? (
        <Link href="/chef/support" className="chef-btn is-small mt-3">
          <LifeBuoy className="h-4 w-4" aria-hidden="true" />
          Ask Craves why
        </Link>
      ) : null}
      {error ? (
        <p role="alert" className="chef-field-error mt-3 !text-[0.9375rem]">
          {error}{" "}
          <Link href="/chef/kitchen" className="font-semibold underline underline-offset-2">
            Check kitchen details
          </Link>
        </p>
      ) : null}
    </section>
  );
}
