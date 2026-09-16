"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  CalendarRange,
  ChefHat,
  ClipboardList,
  LogOut,
  MapPinned,
} from "lucide-react";
import type { CustomerProfile } from "@/lib/profile-contract";
import type { CustomerAddress } from "@/lib/address-contract";
import type { CustomerOrder } from "@/lib/order-contract";
import type { ChefApplication } from "@/lib/chef-application-contract";
import {
  clearSession,
  captureSessionContext,
  isSessionContextCurrent,
  isSessionReady,
  LogoutUnconfirmedError,
  loadSession,
  getSession,
  subscribeSession,
  type CravesUser,
  type SessionContext,
} from "@/services/auth/cravesAuth";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { AccountCard } from "@/components/profile/AccountCard";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { AddressCard } from "@/components/profile/AddressCard";
import { ProfileLinkCard } from "@/components/profile/ProfileLinkCard";
import { EmailVerificationPanel } from "@/components/auth/EmailVerificationPanel";

function chefLink(user: CravesUser, application: ChefApplication | null) {
  if (user.roles.some((role) => role.toUpperCase() === "CHEF")) {
    return {
      to: "/chef",
      title: "Switch to chef mode",
      subtitle: "Manage your kitchen, menu and orders",
    };
  }
  if (application?.status === "PENDING") {
    return {
      to: "/chef/application",
      title: "Chef application pending",
      subtitle: "Review your application and document status",
    };
  }
  if (application?.status === "REJECTED") {
    return {
      to: "/chef/application",
      title: "Update chef application",
      subtitle: "Read the review note and submit corrected details",
    };
  }
  if (application?.status === "APPROVED") {
    return {
      to: "/chef",
      title: "Chef approval received",
      subtitle: "Open chef mode and finish your kitchen setup",
    };
  }
  return {
    to: "/chef/application",
    title: "Become a home chef",
    subtitle: "Apply to cook and sell through Craves",
  };
}

function profileScope(): string {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, isSessionReady()]);
}
const serverProfileScope = () => "server";

export default function ProfilePage() {
  const navigate = useNavigate();
  const scope = useSyncExternalStore(subscribeSession, profileScope, serverProfileScope);
  const logoutAttempt = useRef(0);
  const [logout, setLogout] = useState<{ context: SessionContext | null; busy: boolean; error: string }>({ context: null, busy: false, error: "" });
  const owner = getSession()?.id ?? null;
  const currentLogout = logout.context !== null && isSessionContextCurrent(logout.context);
  async function signOut() {
    if (logout.busy && currentLogout) return;
    const attempt = ++logoutAttempt.current;
    // clearSession synchronously advances the operation generation before its
    // network request; capture that generation rather than only the owner ID.
    const pending = clearSession();
    setLogout({ context: captureSessionContext(), busy: true, error: "" });
    try {
      await pending;
      if (attempt !== logoutAttempt.current) return;
      if (!getSession()) navigate({ to: "/" });
      setLogout({ context: null, busy: false, error: "" });
    } catch (error) {
      if (attempt !== logoutAttempt.current) return;
      if (!(error instanceof LogoutUnconfirmedError) || !error.retryContext || !isSessionContextCurrent(error.retryContext)) return;
      setLogout({ context: error.retryContext, busy: false, error: "Sign-out could not be confirmed. You are still signed in. Please try again." });
    }
  }
  const logoutBusy = currentLogout && logout.busy;
  const logoutError = currentLogout ? logout.error : "";
  return <>
    <ProfileContent key={scope} />
    {owner && <section className="mx-auto max-w-3xl px-4 pb-10 md:px-6" aria-label="Account sign out">
      {logoutError && <p role="alert" className="mb-4 text-sm text-contrast-red">{logoutError}</p>}
      <button type="button" onClick={() => void signOut()} disabled={logoutBusy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-contrast-red bg-white px-4 text-sm font-semibold text-contrast-red transition-colors hover:bg-secondary">
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {logoutBusy ? "Signing out…" : logoutError ? "Retry sign out" : "Sign out"}
      </button>
    </section>}
  </>;
}

function ProfileContent() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CravesUser | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [orderCount, setOrderCount] = useState(0);
  const [application, setApplication] = useState<ChefApplication | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => subscribeSession(() => setUser(getSession())), []);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (getSession() && !isSessionReady()) return;
      const session = await loadSession();
      if (!active) return;
      if (!session) {
        if (!getSession()) navigate({ to: "/" });
        else {
          setError("Your account details are temporarily unavailable. You can retry sign out below.");
          setLoading(false);
        }
        return;
      }
      if (!isSessionReady() || getSession()?.id !== session.id) return;
      const context = captureSessionContext();
      setUser(session);

      const [profileResponse, addressResponse, ordersResponse, chefResponse] =
        await Promise.all([
          fetch("/api/customer/profile", {
            cache: "no-store",
            credentials: "same-origin",
          }),
          fetch("/api/customer/addresses", {
            cache: "no-store",
            credentials: "same-origin",
          }),
          fetch("/api/orders", {
            cache: "no-store",
            credentials: "same-origin",
          }),
          fetch("/api/chef/application", {
            cache: "no-store",
            credentials: "same-origin",
          }),
        ]);

      if (!active || !isSessionContextCurrent(context) || !isSessionReady()) return;

      if (profileResponse.ok) {
        setProfile((await profileResponse.json()) as CustomerProfile);
      }
      if (addressResponse.ok) {
        const body = await addressResponse.json().catch(() => []);
        setAddresses(Array.isArray(body) ? (body as CustomerAddress[]) : []);
      }
      if (ordersResponse.ok) {
        const body = await ordersResponse.json().catch(() => []);
        setOrderCount(Array.isArray(body) ? (body as CustomerOrder[]).length : 0);
      }
      if (chefResponse.ok) {
        setApplication((await chefResponse.json()) as ChefApplication);
      }

      if (!profileResponse.ok && profileResponse.status !== 404) {
        setError("Your profile details could not be loaded. Try refreshing the page.");
      } else if (!profileResponse.ok) {
        setMessage("Complete your profile before placing your next order.");
      } else {
        setMessage("Your details are synced with Craves.");
      }
      setLoading(false);
    })().catch((caught) => {
      if (!active) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Your profile could not be loaded.",
      );
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-grey-50">
        <ProfileHeader />
        <main
          aria-busy={loading}
          className="mx-auto max-w-3xl space-y-4 px-4 py-6 md:px-6"
        >
          <span className="sr-only">{error ? "Profile temporarily unavailable" : "Loading profile"}</span>
          {error ? <p role="alert">Your account details are temporarily unavailable. Sign-out controls remain available below.</p> : <><div className="h-56 animate-pulse rounded-xl bg-grey-200" /><div className="h-24 animate-pulse rounded-xl bg-grey-200" /><div className="h-24 animate-pulse rounded-xl bg-grey-200" /></>}
        </main>
      </div>
    );
  }

  const preferred =
    addresses.find((address) => address.isDefault) ?? addresses[0];
  const addressLine = preferred
    ? [
        preferred.addressLine1,
        preferred.addressLine2,
        preferred.areaName,
        preferred.city,
        preferred.state,
        preferred.postalCode,
      ]
        .filter(Boolean)
        .join(", ")
    : "No delivery address saved yet.";
  const chef = chefLink(user, application);

  return (
    <div className="min-h-screen bg-grey-50 pb-10">
      <ProfileHeader />
      <main className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        <AccountCard
          user={user}
          profile={profile}
          orderCount={orderCount}
          addressCount={addresses.length}
          onEdit={() => setEditOpen(true)}
        />

        {!editOpen && <div className="mt-4"><EmailVerificationPanel /></div>}

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {message}
          </p>
        )}

        <section aria-labelledby="account-actions" className="mt-6 space-y-4">
          <h2 id="account-actions" className="sr-only">
            Account actions
          </h2>
          <ProfileLinkCard
            to={chef.to}
            icon={ChefHat}
            title={chef.title}
            subtitle={chef.subtitle}
          />
          <AddressCard
            addressLine={addressLine}
            onEdit={() => navigate({ to: "/addresses" })}
          />
          <ProfileLinkCard
            to="/addresses"
            icon={MapPinned}
            title="Delivery addresses"
            subtitle={`${addresses.length} saved address${addresses.length === 1 ? "" : "es"}`}
          />
          <ProfileLinkCard
            to="/orders"
            icon={ClipboardList}
            title="My orders"
            subtitle={`${orderCount} order${orderCount === 1 ? "" : "s"} in your history`}
          />
          <ProfileLinkCard
            to="/notifications"
            icon={Bell}
            title="Notifications"
            subtitle="Order, delivery and account updates"
          />
          <ProfileLinkCard
            to="/subscriptions"
            icon={CalendarRange}
            title="Meal subscriptions"
            subtitle="View available plans and manage active subscriptions"
          />
        </section>

      </main>

      <EditProfileModal
        open={editOpen}
        profile={profile}
        onClose={() => setEditOpen(false)}
        onSaved={(savedProfile) => {
          setProfile(savedProfile);
          setMessage("Your profile changes were saved.");
          setError("");
        }}
      />
    </div>
  );
}
