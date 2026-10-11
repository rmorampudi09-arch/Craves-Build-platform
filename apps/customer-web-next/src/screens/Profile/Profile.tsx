"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  FaBagShopping,
  FaBell,
  FaCalendarDays,
  FaComments,
  FaCreditCard,
  FaGift,
  FaHeadset,
  FaHeart,
  FaRightFromBracket,
} from "react-icons/fa6";
import { GiChefToque } from "react-icons/gi";

import { AccountCard } from "@/components/profile/AccountCard";
import { AddressCard } from "@/components/profile/AddressCard";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { CustomerSignOutDialog } from "@/components/home/CustomerSignOutDialog";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileLinkCard } from "@/components/profile/ProfileLinkCard";
import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";
import type { CustomerAddress } from "@/lib/address-contract";
import type { ChefApplication } from "@/lib/chef-application-contract";
import type { CustomerOrder } from "@/lib/order-contract";
import type { CustomerProfile } from "@/lib/profile-contract";
import {
  captureSessionContext,
  clearSession,
  getSession,
  isSessionContextCurrent,
  isSessionReady,
  loadSession,
  LogoutUnconfirmedError,
  subscribeSession,
  type CravesUser,
  type SessionContext,
} from "@/services/auth/cravesAuth";
import { cartCount, loadCart } from "@/services/api/cravesCart";
import { loadCustomerFavoriteIds } from "@/services/api/customerFavorites";

// Chef mode has its own sign-in, which then returns to the chef destination.
const CHEF_MODE_LINK = "/chef/sign-in?returnTo=/chef";
const CHEF_APPLICATION_LINK = "/chef/sign-in?returnTo=/chef/application";

export function chefLink(user: CravesUser, application: ChefApplication | null) {
  if (user.roles.some((role) => role.toUpperCase() === "CHEF")) {
    return {
      to: CHEF_MODE_LINK,
      title: "Switch to Chef mode",
      subtitle: "Manage your kitchen, menu and orders",
    };
  }

  if (application?.status === "PENDING") {
    return {
      to: CHEF_APPLICATION_LINK,
      title: "Chef application pending",
      subtitle: "Review your application and document status",
    };
  }

  if (application?.status === "REJECTED") {
    return {
      to: CHEF_APPLICATION_LINK,
      title: "Update chef application",
      subtitle: "Read the review note and submit corrected details",
    };
  }

  if (application?.status === "APPROVED") {
    return {
      to: CHEF_MODE_LINK,
      title: "Chef approval received",
      subtitle: "Open Chef mode and finish your kitchen setup",
    };
  }

  // A saved draft is still NOT_SUBMITTED, but it already has a record or uploads.
  if (application && (application.id || application.documents.length > 0)) {
    return {
      to: CHEF_APPLICATION_LINK,
      title: "Continue your chef application",
      subtitle: "Pick up where you left off",
    };
  }

  return {
    to: CHEF_APPLICATION_LINK,
    title: "Become a home chef",
    subtitle: "Apply to cook and sell through Craves",
  };
}

function profileScope(): string {
  const context = captureSessionContext();
  return JSON.stringify([
    context.generation,
    context.identityId,
    isSessionReady(),
  ]);
}

const serverProfileScope = () => "server";

type ProfileContentProps = {
  onSignOut: () => void;
};

function ProfileSignOutAction({ onSignOut }: ProfileContentProps) {
  return (
    <button
      type="button"
      onClick={onSignOut}
      aria-label="Sign out"
      className="flex min-h-[76px] w-full items-center gap-3 rounded-2xl !border-[#E5E7EB] !bg-white p-3.5 text-left !shadow-none transition-[box-shadow] hover:!shadow-[0_8px_22px_rgba(26,26,26,0.07)] sm:p-4"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]">
        <FaRightFromBracket className="text-[18px]" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-black text-[#1A1A1A]">Sign out</span>
        <span className="mt-0.5 block text-xs leading-5 text-[#6B6B6B]">
          Sign out of this Craves account
        </span>
      </span>
    </button>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const scope = useSyncExternalStore(
    subscribeSession,
    profileScope,
    serverProfileScope,
  );
  const logoutAttempt = useRef(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [logout, setLogout] = useState<{
    context: SessionContext | null;
    busy: boolean;
    error: string;
  }>({ context: null, busy: false, error: "" });

  const currentLogout =
    logout.context !== null && isSessionContextCurrent(logout.context);

  async function signOut() {
    if (logout.busy && currentLogout) return;

    const attempt = ++logoutAttempt.current;
    const pending = clearSession();
    setLogout({
      context: captureSessionContext(),
      busy: true,
      error: "",
    });

    try {
      await pending;
      if (attempt !== logoutAttempt.current) return;
      if (!getSession()) {
        // Stay on "Signing out…" until the landing page replaces this one.
        setLeaving(true);
        navigate({ to: "/" });
      }
      setLogout({ context: null, busy: false, error: "" });
    } catch (error) {
      if (attempt !== logoutAttempt.current) return;
      if (
        !(error instanceof LogoutUnconfirmedError) ||
        !error.retryContext ||
        !isSessionContextCurrent(error.retryContext)
      ) {
        return;
      }

      setLogout({
        context: error.retryContext,
        busy: false,
        error:
          "We couldn’t confirm that you signed out, so you’re still signed in. Please try again.",
      });
    }
  }

  const logoutBusy = leaving || (currentLogout && logout.busy);
  return (
    <>
      <ProfileContent key={scope} onSignOut={() => setConfirmOpen(true)} />
      <CustomerSignOutDialog
        open={confirmOpen}
        busy={logoutBusy}
        error={currentLogout ? logout.error : ""}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void signOut()}
      />
    </>
  );
}

function ProfileContent({ onSignOut }: ProfileContentProps) {
  const navigate = useNavigate();
  const [user, setUser] = useState<CravesUser | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [orderCount, setOrderCount] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [cartItemCount, setCartItemCount] = useState(0);
  const [application, setApplication] = useState<ChefApplication | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void (async () => {
      if (getSession() && !isSessionReady()) {
        setError(
          "Your account details are temporarily unavailable. Sign-out controls remain available below.",
        );
        setLoading(false);
        return;
      }

      const session = await loadSession();
      if (!active) return;

      if (!session) {
        if (!getSession()) {
          navigate({ to: "/" });
        } else {
          setError(
            "Your account details are temporarily unavailable. Sign-out controls remain available below.",
          );
          setLoading(false);
        }
        return;
      }

      if (!isSessionReady() || getSession()?.id !== session.id) return;

      const context = captureSessionContext();
      setUser(session);

      const [
        profileResponse,
        addressResponse,
        ordersResponse,
        chefResponse,
        favoriteIds,
        loadedCart,
      ] = await Promise.all([
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
        loadCustomerFavoriteIds().catch(() => new Set<string>()),
        loadCart().catch(() => []),
      ]);

      if (
        !active ||
        !isSessionContextCurrent(context) ||
        !isSessionReady()
      ) {
        return;
      }

      if (profileResponse.ok) {
        setProfile((await profileResponse.json()) as CustomerProfile);
      }

      if (addressResponse.ok) {
        const body = await addressResponse.json().catch(() => []);
        setAddresses(
          Array.isArray(body) ? (body as CustomerAddress[]) : [],
        );
      }

      if (ordersResponse.ok) {
        const body = await ordersResponse.json().catch(() => []);
        setOrderCount(
          Array.isArray(body) ? (body as CustomerOrder[]).length : 0,
        );
      }

      if (chefResponse.ok) {
        setApplication((await chefResponse.json()) as ChefApplication);
      }

      setFavoriteCount(favoriteIds.size);
      setCartItemCount(loadedCart.length ? cartCount() : 0);

      if (!profileResponse.ok && profileResponse.status !== 404) {
        setError(
          "Your profile details could not be loaded. Try refreshing the page.",
        );
      } else {
        setMessage("");
      }

      setLoading(false);
    })().catch(() => {
      if (!active) return;
      setError(
        getSession()
          ? "Your account details are temporarily unavailable. Sign-out controls remain available below."
          : "Your profile could not be loaded.",
      );
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  if (loading) {
    return <CustomerPageSkeleton label="Loading your Craves profile" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white">
        <ProfileHeader />
        <main
          aria-busy={loading}
          className="mx-auto max-w-5xl space-y-4 px-4 py-5 md:px-6 md:py-7"
        >
          {loading ? (
            <>
              <span className="sr-only">Loading profile</span>
              <div className="h-56 animate-pulse rounded-[1.6rem] bg-[#F1F3F5]" />
              <div className="h-28 animate-pulse rounded-[1.6rem] bg-[#F1F3F5]" />
              <div className="h-48 animate-pulse rounded-[1.6rem] bg-[#F1F3F5]" />
            </>
          ) : error ? (
            <p
              role="alert"
              className="rounded-xl bg-[#F1F3F5] p-4 text-sm font-medium text-[#C4200F]"
            >
              {error}
            </p>
          ) : null}

          {getSession() ? <ProfileSignOutAction onSignOut={onSignOut} /> : null}
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
    <div className="min-h-screen bg-[#FAFAFA] pb-8 text-[#1A1A1A] md:pb-12">
      <ProfileHeader />

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-4 md:px-6 md:pt-6">
        <AccountCard
          user={user}
          profile={profile}
          orderCount={orderCount}
          addressCount={addresses.length}
          onEdit={() => setEditOpen(true)}
        />

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-[#F1F3F5] p-3 text-xs font-semibold text-[#C4200F]"
          >
            {error}
          </p>
        ) : message ? (
          <p
            role="status"
            className="mt-3 rounded-xl bg-[#F1F3F5] px-3 py-2.5 text-xs font-semibold text-[#1A1A1A]"
          >
            {message}
          </p>
        ) : null}

        <section aria-labelledby="profile-your-craves" className="mt-7">
          <div className="mb-3 px-1">
            <h2
              id="profile-your-craves"
              className="text-lg font-black text-[#1A1A1A]"
            >
              Orders, saved dishes & delivery
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <AddressCard
              addressLine={addressLine}
              onEdit={() => navigate({ to: "/addresses" })}
            />
            <ProfileLinkCard
              to="/orders"
              icon={FaBagShopping}
              title="My orders"
              subtitle={
                orderCount +
                " " +
                (orderCount === 1 ? "order" : "orders") +
                " in your history"
              }
            />
            <ProfileLinkCard
              to="/wishlist"
              icon={FaHeart}
              title="Saved"
              subtitle={
                favoriteCount +
                " " +
                (favoriteCount === 1 ? "saved dish" : "saved dishes")
              }
              badge={String(favoriteCount)}
            />
            <ProfileLinkCard
              to="/notifications"
              icon={FaBell}
              title="Notifications"
              subtitle="Order, delivery and account updates"
            />
          </div>
        </section>

        <section aria-labelledby="profile-meal-subscription" className="mt-7">
          <div className="mb-3 px-1">
            <h2
              id="profile-meal-subscription"
              className="text-lg font-black text-[#1A1A1A]"
            >
              Your recurring meal plans
            </h2>
          </div>

          <ProfileLinkCard
            to="/subscriptions"
            icon={FaCalendarDays}
            title="Meal plans"
            subtitle="Browse, start and manage recurring home-cooked meal plans"
          />
        </section>

        <section aria-labelledby="profile-benefits" className="mt-7">
          <div className="mb-3 px-1">
            <h2
              id="profile-benefits"
              className="text-lg font-black text-[#1A1A1A]"
            >
              Payments, referrals & chef tools
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ProfileLinkCard
              to="/cart"
              icon={FaCreditCard}
              title="Cart & checkout"
              subtitle={
                cartItemCount +
                " " +
                (cartItemCount === 1 ? "item ready in your cart" : "items ready in your cart")
              }
              badge={String(cartItemCount)}
            />
            <ProfileLinkCard
              icon={FaGift}
              title="Refer a friend"
              subtitle="Invite friends and earn rewards"
              badge="Soon"
              disabled
            />
            <ProfileLinkCard
              to={chef.to}
              icon={GiChefToque}
              title={chef.title}
              subtitle={chef.subtitle}
            />
          </div>
        </section>

        <section aria-labelledby="profile-support" className="mt-7">
          <div className="mb-3 px-1">
            <h2
              id="profile-support"
              className="text-lg font-black text-[#1A1A1A]"
            >
              Help & security
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ProfileLinkCard
              to="/contact"
              icon={FaHeadset}
              title="Contact us"
              subtitle="Help and support"
            />
            <ProfileLinkCard
              to="/support"
              icon={FaComments}
              title="Chat with support"
              subtitle="Get quick answers about orders and payments"
            />

            <ProfileSignOutAction onSignOut={onSignOut} />
          </div>
        </section>
      </main>

      <EditProfileModal
        open={editOpen}
        profile={profile}
        initialEmail={user.email ?? profile?.email ?? ""}
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
