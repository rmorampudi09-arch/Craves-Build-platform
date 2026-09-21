"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  FaBagShopping,
  FaBell,
  FaCalendarDays,
  FaCreditCard,
  FaGift,
  FaHeadset,
  FaHeart,
  FaRightFromBracket,
} from "react-icons/fa6";
import { GiChefToque } from "react-icons/gi";

import { EmailVerificationPanel } from "@/components/auth/EmailVerificationPanel";
import { AccountCard } from "@/components/profile/AccountCard";
import { AddressCard } from "@/components/profile/AddressCard";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileLinkCard } from "@/components/profile/ProfileLinkCard";
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

function chefLink(user: CravesUser, application: ChefApplication | null) {
  if (user.roles.some((role) => role.toUpperCase() === "CHEF")) {
    return {
      to: "/chef",
      title: "Switch to Chef mode",
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
      subtitle: "Open Chef mode and finish your kitchen setup",
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
  return JSON.stringify([
    context.generation,
    context.identityId,
    isSessionReady(),
  ]);
}

const serverProfileScope = () => "server";

type ProfileContentProps = {
  logoutBusy: boolean;
  logoutError: string;
  onSignOut: () => void;
};

function ProfileSignOutAction({
  logoutBusy,
  logoutError,
  onSignOut,
}: ProfileContentProps) {
  const label = logoutBusy
    ? "Signing out…"
    : logoutError
      ? "Retry sign out"
      : "Sign out";

  return (
            <ProfileSignOutAction
              logoutBusy={logoutBusy}
              logoutError={logoutError}
              onSignOut={onSignOut}
            />
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
      if (!getSession()) navigate({ to: "/" });
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
          "Sign-out could not be confirmed. You are still signed in. Please try again.",
      });
    }
  }

  return (
    <ProfileContent
      key={scope}
      logoutBusy={currentLogout && logout.busy}
      logoutError={currentLogout ? logout.error : ""}
      onSignOut={() => void signOut()}
    />
  );
}

function ProfileContent({
  logoutBusy,
  logoutError,
  onSignOut,
}: ProfileContentProps) {
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

      if (!profileResponse.ok && profileResponse.status !== 404) {
        setError(
          "Your profile details could not be loaded. Try refreshing the page.",
        );
      } else if (!profileResponse.ok) {
        setMessage(
          "Complete your profile before placing your next order.",
        );
      } else {
        setMessage("Your details are synced with Craves.");
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

  if (loading || !user) {
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
              className="rounded-xl border border-[#F62E18]/20 bg-[#F62E18]/5 p-4 text-sm text-[#C92716]"
            >
              {error}
            </p>
          ) : null}

          {getSession() ? (
            <ProfileSignOutAction
              logoutBusy={logoutBusy}
              logoutError={logoutError}
              onSignOut={onSignOut}
            />
          ) : null}

          {logoutError ? (
            <p
              role="alert"
              className="rounded-xl bg-[#FFF1EF] p-3 text-xs font-semibold text-[#C92716]"
            >
              {logoutError}
            </p>
          ) : null}
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
  const emailForVerification = user.email ?? profile?.email ?? "";

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
            className="mt-4 rounded-xl border border-[#F62E18]/20 bg-[#F62E18]/5 p-3 text-xs font-semibold text-[#C92716]"
          >
            {error}
          </p>
        ) : (
          <p
            role="status"
            className="mt-3 px-1 text-xs font-semibold text-[#6B6B6B]"
          >
            {message}
          </p>
        )}

        <section className="mt-5 rounded-[1.55rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(26,26,26,0.05)] sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFF1EF] text-[#F62E18]">
              <FaGift className="text-lg" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-[#F62E18]">
                Craves Rewards
              </p>
              <h2 className="mt-1 text-base font-black text-[#1A1A1A]">
                Rewards currently unavailable
              </h2>
              <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
                Your rewards balance and tier will appear here when the
                customer rewards experience is available on web.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="profile-your-craves" className="mt-7">
          <div className="mb-3 px-1">
            <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[#F62E18]">
              Your Craves
            </p>
            <h2
              id="profile-your-craves"
              className="mt-1 text-lg font-black text-[#1A1A1A]"
            >
              Orders, favorites & delivery
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
              title="Favorites"
              subtitle="Saved meals and kitchens"
            />
            <ProfileLinkCard
              to="/notifications"
              icon={FaBell}
              title="Notifications"
              subtitle="Order, delivery and account updates"
            />
          </div>
        </section>

        <section aria-labelledby="profile-benefits" className="mt-7">
          <div className="mb-3 px-1">
            <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[#F62E18]">
              Plans & benefits
            </p>
            <h2
              id="profile-benefits"
              className="mt-1 text-lg font-black text-[#1A1A1A]"
            >
              Membership, payments & referrals
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ProfileLinkCard
              to="/subscriptions"
              icon={FaCalendarDays}
              title="Membership"
              subtitle="Meal subscriptions and benefits"
            />
            <ProfileLinkCard
              to="/cart"
              icon={FaCreditCard}
              title="Payments"
              subtitle="Choose and confirm your payment method securely at checkout"
              badge="Checkout"
            />
            <ProfileLinkCard
              icon={FaGift}
              title="Referral to friend"
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
            <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[#F62E18]">
              Account & support
            </p>
            <h2
              id="profile-support"
              className="mt-1 text-lg font-black text-[#1A1A1A]"
            >
              Email, help & security
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ProfileLinkCard
              to="/contact"
              icon={FaHeadset}
              title="Contact us"
              subtitle="Help and support"
            />

            <button
              type="button"
              onClick={onSignOut}
              disabled={logoutBusy}
              aria-label={
                logoutBusy
                  ? "Signing out…"
                  : logoutError
                    ? "Retry sign out"
                    : "Sign out"
              }
              className="group flex min-h-[76px] items-center justify-between gap-3 rounded-2xl border border-[#F62E18]/20 bg-white p-3.5 text-left transition-[box-shadow,background-color] hover:bg-[#FFF8F7] hover:shadow-[0_8px_22px_rgba(246,46,24,0.07)] disabled:opacity-50 sm:p-4"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFF1EF] text-[#F62E18]">
                  <FaRightFromBracket
                    className="text-[18px]"
                    aria-hidden="true"
                  />
                </span>
                <span>
                  <span className="block text-sm font-black text-[#C92716]">
                    {logoutBusy
                      ? "Signing out…"
                      : logoutError
                        ? "Retry sign out"
                        : "Logout"}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#6B6B6B]">
                    Sign out of this Craves account
                  </span>
                </span>
              </span>
            </button>
          </div>

          {logoutError ? (
            <p
              role="alert"
              className="mt-3 rounded-xl bg-[#FFF1EF] p-3 text-xs font-semibold text-[#C92716]"
            >
              {logoutError}
            </p>
          ) : null}

          {!editOpen ? (
            <div className="mt-3">
              <EmailVerificationPanel
                initialEmail={emailForVerification}
                onVerified={(state) => {
                  setUser((current) =>
                    current
                      ? {
                          ...current,
                          email: state.email ?? undefined,
                          emailVerified: true,
                        }
                      : current,
                  );
                }}
              />
            </div>
          ) : null}
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
