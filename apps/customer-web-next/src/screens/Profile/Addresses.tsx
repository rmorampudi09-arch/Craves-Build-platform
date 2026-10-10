"use client";

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  displayAddressLabel,
  isDeliveryReadyAddress,
  type CustomerAddress,
} from "@/lib/address-contract";
import { clearDishDiscoveryCache } from "@/services/api/dishes";
import { clearKitchenDiscoveryCache } from "@/services/api/kitchens";
import {
  invalidateSelectedAddress,
  loadSession,
} from "@/services/auth/cravesAuth";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";
import { AddressEditorFlow } from "@/components/profile/AddressEditorFlow";
import { Dialog, secondaryActionClass } from "@/components/ui/overlays/overlay";

function addressLine(address: CustomerAddress): string {
  return [
    address.addressLine1,
    address.addressLine2,
    address.landmark,
    address.areaName,
    address.districtName,
    address.city,
    address.state,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function displayPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : value;
}

function recipientLine(address: CustomerAddress): string {
  return [address.recipientName, displayPhone(address.contactPhoneNumber)]
    .filter(Boolean)
    .join(" · ");
}

function addressDisplayName(address: CustomerAddress): string {
  return displayAddressLabel(address.addressLabel);
}

function invalidateHomeDeliveryContext(): void {
  invalidateSelectedAddress();
  clearDishDiscoveryCache();
  clearKitchenDiscoveryCache();
}

export default function AddressesPage() {
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [initialLoadState, setInitialLoadState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorAddress, setEditorAddress] = useState<CustomerAddress | null>(null);
  const [profileDefaults, setProfileDefaults] = useState({
    recipientName: "",
    contactPhoneNumber: "",
  });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerAddress | null>(null);
  const [deleteError, setDeleteError] = useState("");
  // The skeleton and the empty state speak for themselves; this line is for changes.
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/customer/addresses", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(body?.message || "Your saved addresses didn’t load. Check your connection and try again.");
    setAddresses(body);
    setInitialLoadState("ready");
    const incomplete = body.filter(
      (address: CustomerAddress) => !isDeliveryReadyAddress(address),
    ).length;
    setMessage(
      incomplete > 0
        ? `${body.length} saved address${body.length === 1 ? "" : "es"}; ${incomplete} need${incomplete === 1 ? "s" : ""} completion before checkout.`
        : body.length
          ? `${body.length} saved address${body.length === 1 ? "" : "es"}.`
          : "",
    );
  }, []);

  useEffect(() => {
    void (async () => {
      const current = await loadSession();
      if (!current) {
        navigate({ to: "/" });
        return;
      }
      setProfileDefaults({
        recipientName:
          [current.firstName, current.lastName].filter(Boolean).join(" ").trim()
          || current.username
          || "",
        contactPhoneNumber: current.phoneNumber || current.phone || "",
      });
      await load();
    })().catch((error) => {
      setInitialLoadState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Your saved addresses didn’t load. Check your connection and try again.",
      );
    });
  }, [load, navigate]);

  function beginCreate() {
    setEditorAddress(null);
    setEditorOpen(true);
  }

  function beginEdit(address: CustomerAddress) {
    setEditorAddress(address);
    setEditorOpen(true);
  }

  async function selectDefault(address: CustomerAddress) {
    if (address.isDefault || busy) return;

    setBusy(true);
    try {
      const response = await fetch(
        `/api/customer/addresses/${address.id}/default`,
        {
          method: "PUT",
          credentials: "same-origin",
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || "Your default address didn’t change. Try again.");
      }
      invalidateHomeDeliveryContext();
      await load();
      setMessage(
        `${addressDisplayName(address)} is now your default delivery address.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Your default address didn’t change. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(address: CustomerAddress) {
    setBusy(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/customer/addresses/${address.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "This address wasn’t deleted. Try again.");
      }
      invalidateHomeDeliveryContext();
      await load();
      setDeleteTarget(null);
      setMessage("Address deleted.");
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "We couldn’t delete this address. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-5 md:px-6 md:py-6">
          <Link
            to="/profile"
            aria-label="Back to profile"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-white transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[#F1F3F5] hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)]"
          >
            <ArrowLeft className="h-6 w-6 text-[#1A1A1A]" strokeWidth={2.25} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#6B6B6B] md:text-base">
              Your places
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-[#1A1A1A] md:text-[2rem] md:leading-tight">
              Delivery addresses
            </h1>
          </div>
          <button
            type="button"
            onClick={beginCreate}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl !border !border-[#E5E7EB] !bg-[#F1F3F5] px-4 py-3 text-sm font-bold !text-[#1A1A1A] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none md:px-5"
          >
            <Plus className="h-5 w-5" strokeWidth={2.25} />
            <span className="hidden sm:inline">Add New Address</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-5xl px-4 pt-7 md:px-6 md:pt-9">
        <div className="mb-6 flex items-start gap-3 rounded-2xl bg-[#F1F3F5] px-4 py-4 md:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18]">
            <MapPin className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-[#1A1A1A]">Choose your default delivery address here</p>
            <p className="mt-1 text-xs font-medium leading-5 text-[#6B6B6B] md:text-sm">
              Craves Home discovery and delivery availability use the address you select as default.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {addresses.map((address) => {
            const ready = isDeliveryReadyAddress(address);
            return (
              <article
                key={address.id}
                className={`rounded-[24px] border bg-white px-5 py-5 shadow-[0_4px_18px_rgba(26,26,26,0.06)] transition-shadow md:px-6 md:py-6 ${
                  address.isDefault
                    ? "border-[#F62E18] shadow-[inset_0_0_0_1px_#F62E18]"
                    : "border-[#E5E7EB] hover:shadow-[0_10px_30px_rgba(26,26,26,0.09)]"
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F1F3F5] text-[#F62E18] md:h-14 md:w-14">
                    <MapPin className="h-6 w-6 fill-[#F62E18] text-[#F62E18]" strokeWidth={2.1} aria-hidden="true" />
                    <span className="pointer-events-none absolute left-1/2 top-[43%] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-black text-[#1A1A1A] md:text-xl">
                        {addressDisplayName(address)}
                      </h2>
                      {address.isDefault ? (
                        <span className="inline-flex items-center rounded-full bg-[#F1F3F5] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#1A1A1A] md:text-[11px]">
                          <Check className="mr-1 h-3.5 w-3.5" strokeWidth={2.7} />
                          Default
                        </span>
                      ) : null}
                      {!ready ? (
                        <span className="rounded-full bg-[#F1F3F5] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#F62E18] md:text-[11px]">
                          UPDATE REQUIRED
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm font-bold text-[#1A1A1A]">
                      {recipientLine(address)}
                    </p>
                    <p className="mt-1.5 text-sm leading-6 text-[#6B6B6B]">
                      {addressLine(address)}
                    </p>
                    {!ready ? (
                      <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#F1F3F5] p-3 text-xs leading-5 text-[#6B6B6B]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F62E18]" />
                        This older saved address needs missing delivery details before checkout.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#F1F3F5] pt-4">
                  <button
                    type="button"
                    disabled={busy || address.isDefault}
                    onClick={() => void selectDefault(address)}
                    className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition-[background-color,box-shadow,transform] duration-200 ease-out sm:flex-none sm:text-sm ${
                      address.isDefault
                        ? "!bg-[#F1F3F5] !text-[#6B6B6B]"
                        : "!border !border-[#E5E7EB] !bg-[#F1F3F5] !text-[#1A1A1A] hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none"
                    } disabled:cursor-not-allowed disabled:opacity-55`}
                  >
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                    {address.isDefault ? "Default address" : "Set as default"}
                  </button>
                  <button
                    type="button"
                    onClick={() => beginEdit(address)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl !bg-[#F1F3F5] px-3.5 py-2 text-xs font-black !text-[#1A1A1A] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none sm:text-sm"
                  >
                    <Pencil className="h-4 w-4 text-[#F62E18]" strokeWidth={2.25} />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setDeleteError("");
                      setDeleteTarget(address);
                    }}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl !bg-transparent px-3 py-2 text-xs font-black !text-[#6B6B6B] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-[#F1F3F5] hover:!text-[#1A1A1A] hover:shadow-[0_7px_18px_rgba(26,26,26,0.08)] active:translate-y-0 motion-reduce:transform-none disabled:opacity-50 sm:text-sm"
                  >
                    <Trash2 className="h-4 w-4 text-[#F62E18]" strokeWidth={2.25} />
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {initialLoadState === "loading" ? (
          <div
            className="space-y-4"
            role="status"
            aria-label="Loading saved addresses"
          >
            {Array.from({ length: 2 }, (_, index) => (
              <div
                key={index}
                className="rounded-[24px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_4px_18px_rgba(26,26,26,0.04)] md:px-6 md:py-6"
                aria-hidden="true"
              >
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-[#F1F3F5] md:h-14 md:w-14" />
                  <div className="min-w-0 flex-1">
                    <div className="h-5 w-28 animate-pulse rounded-full bg-[#F1F3F5]" />
                    <div className="mt-3 h-4 w-40 animate-pulse rounded-full bg-[#F1F3F5]" />
                    <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded-full bg-[#F1F3F5]" />
                  </div>
                </div>
              </div>
            ))}
            <span className="sr-only">Loading saved addresses…</span>
          </div>
        ) : null}

        {initialLoadState === "error" ? (
          <div
            role="alert"
            className="rounded-[24px] border border-[#E5E7EB] bg-white px-6 py-8 text-center"
          >
            <AlertTriangle className="mx-auto h-8 w-8 text-[#F62E18]" />
            <h2 className="mt-3 font-display text-xl font-black">
              Saved addresses could not be loaded
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              {message}
            </p>
          </div>
        ) : null}

        {initialLoadState === "ready" && addresses.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#D7DADF] bg-white px-6 py-10 text-center">
            <MapPin className="mx-auto h-8 w-8 text-[#F62E18]" />
            <h2 className="mt-3 font-display text-xl font-black">No saved addresses yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              Add your first delivery address, then select it as default for nearby dishes and kitchens.
            </p>
            <button
              type="button"
              onClick={beginCreate}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl !border !border-[#E5E7EB] !bg-[#F1F3F5] px-5 py-2.5 text-sm font-black !text-[#1A1A1A] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none"
            >
              <Plus className="h-4.5 w-4.5" />
              Add New Address
            </button>
          </div>
        ) : null}

        <p role="status" className="mt-6 px-1 text-sm text-[#6B6B6B]">
          {message}
        </p>
      </main>

      <AddressEditorFlow
        open={editorOpen}
        initialAddress={editorAddress}
        profileDefaults={profileDefaults}
        onClose={() => {
          setEditorOpen(false);
          setEditorAddress(null);
        }}
        onSaved={async (saved) => {
          invalidateHomeDeliveryContext();
          setEditorOpen(false);
          setEditorAddress(null);
          await load();
          setMessage(
            saved?.isDefault
              ? "Address saved and set as your default delivery address."
              : "Address saved. Select it as default from your saved addresses when you want Home to use it.",
          );
        }}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteTarget(null);
        }}
        busy={busy}
        title="Delete this address?"
        description={
          deleteTarget
            ? "This removes your " +
              displayAddressLabel(deleteTarget.addressLabel) +
              " address from your saved delivery addresses."
            : "This address will be removed from your saved delivery addresses."
        }
        footer={
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeleteTarget(null)}
              className={secondaryActionClass}
            >
              Keep address
            </button>
            <button
              type="button"
              disabled={busy || !deleteTarget}
              aria-busy={busy}
              onClick={() => {
                if (deleteTarget) void remove(deleteTarget);
              }}
              className="craves-primary-action w-full sm:w-auto"
            >
              {busy ? "Deleting…" : "Delete address"}
            </button>
          </>
        }
      >
        {deleteError ? (
          <p role="alert" className="mt-4 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]">
            {deleteError}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
