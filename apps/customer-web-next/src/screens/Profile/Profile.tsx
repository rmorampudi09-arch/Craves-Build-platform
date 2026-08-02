"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, ChefHat, ClipboardList, Heart, LogOut, MapPinned } from "lucide-react";
import type { CustomerProfile } from "@/lib/profile-contract";
import type { CustomerAddress } from "@/lib/address-contract";
import type { CustomerOrder } from "@/lib/order-contract";
import type { ChefApplication } from "@/lib/chef-application-contract";
import { clearSession, loadSession, type CravesUser } from "@/services/auth/cravesAuth";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { AccountCard } from "@/components/profile/AccountCard";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { AddressCard } from "@/components/profile/AddressCard";
import { ProfileLinkCard } from "@/components/profile/ProfileLinkCard";

function chefLink(user: CravesUser, application: ChefApplication | null) {
  if (user.roles.map((role) => role.toUpperCase()).includes("CHEF")) {
    return {
      to: "/chef",
      title: "Switch to chef mode",
      subtitle: "Manage your kitchen, menu and chef orders",
    };
  }
  if (application?.status === "PENDING") {
    return {
      to: "/chef/application",
      title: "Chef application pending",
      subtitle: "Review the application and uploaded proof status",
    };
  }
  if (application?.status === "REJECTED") {
    return {
      to: "/chef/application",
      title: "Update chef application",
      subtitle: "Review the admin note and resubmit corrected details",
    };
  }
  if (application?.status === "APPROVED") {
    return {
      to: "/chef",
      title: "Chef approval syncing",
      subtitle: "Open chef mode to refresh your approved access",
    };
  }
  return {
    to: "/chef/application",
    title: "Become a home chef",
    subtitle: "Submit your chef registration for admin approval",
  };
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CravesUser | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [orderCount, setOrderCount] = useState(0);
  const [application, setApplication] = useState<ChefApplication | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [message, setMessage] = useState("Loading your profile…");

  useEffect(() => {
    void (async () => {
      const session = await loadSession();
      if (!session) {
        navigate({ to: "/" });
        return;
      }
      setUser(session);
      const [profileResponse, addressResponse, ordersResponse, chefResponse] = await Promise.all([
        fetch("/api/customer/profile", { cache: "no-store" }),
        fetch("/api/customer/addresses", { cache: "no-store" }),
        fetch("/api/orders", { cache: "no-store" }),
        fetch("/api/chef/application", { cache: "no-store" }),
      ]);
      if (profileResponse.ok) setProfile(await profileResponse.json());
      if (addressResponse.ok) setAddresses(await addressResponse.json());
      if (ordersResponse.ok) setOrderCount((await ordersResponse.json() as CustomerOrder[]).length);
      if (chefResponse.ok) setApplication(await chefResponse.json());
      setMessage(
        profileResponse.ok
          ? "Profile synced with Craves."
          : "Complete your customer profile to keep checkout details current.",
      );
    })().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Profile could not be loaded.");
    });
  }, [navigate]);

  if (!user) {
    return (
      <div className="min-h-screen bg-cream p-8 text-center text-sm text-muted-foreground">
        {message}
      </div>
    );
  }

  const preferred = addresses.find((address) => address.isDefault) ?? addresses[0];
  const addressLine = preferred
    ? [
        preferred.addressLine1,
        preferred.addressLine2,
        preferred.areaName,
        preferred.city,
        preferred.state,
        preferred.postalCode,
      ].filter(Boolean).join(", ")
    : "No delivery address saved yet.";
  const chef = chefLink(user, application);

  async function logout() {
    await clearSession();
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-cream pb-10">
      <ProfileHeader />
      <main className="mx-auto max-w-3xl px-4 pt-6 md:px-6">
        <AccountCard user={user} profile={profile} onEdit={() => setEditOpen(true)} />
        <p role="status" className="mt-3 text-xs text-muted-foreground">{message}</p>
        <div className="mt-4">
          <ProfileLinkCard
            to={chef.to}
            icon={ChefHat}
            title={chef.title}
            subtitle={chef.subtitle}
          />
        </div>
        <div className="mt-4">
          <ProfileLinkCard
            to="/wishlist"
            icon={Heart}
            title="My wishlist"
            subtitle="Saved on this browser until a wishlist backend is available"
          />
        </div>
        <AddressCard addressLine={addressLine} onEdit={() => navigate({ to: "/addresses" })} />
        <div className="mt-4">
          <ProfileLinkCard
            to="/addresses"
            icon={MapPinned}
            title="Delivery addresses"
            subtitle={`${addresses.length} saved address${addresses.length === 1 ? "" : "es"}`}
          />
        </div>
        <div className="mt-4">
          <ProfileLinkCard
            to="/orders"
            icon={ClipboardList}
            title="My orders"
            subtitle={`${orderCount} backend order${orderCount === 1 ? "" : "s"} · tap to view & track`}
          />
        </div>
        <div className="mt-4">
          <ProfileLinkCard
            to="/notifications"
            icon={Bell}
            title="Notifications"
            subtitle="Updates from Craves"
          />
        </div>
        <button type="button" onClick={() => void logout()} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-white p-4 text-sm font-bold text-ink hover:border-primary">
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </main>
      <EditProfileModal
        open={editOpen}
        profile={profile}
        onClose={() => setEditOpen(false)}
        onSaved={setProfile}
      />
    </div>
  );
}
