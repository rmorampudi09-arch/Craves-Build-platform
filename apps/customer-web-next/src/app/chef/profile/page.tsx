"use client";

import Link from "next/link";
import {
  BadgeIndianRupee,
  Bell,
  CalendarDays,
  ChevronRight,
  FileCheck2,
  MapPin,
  Store,
  UserRound,
} from "lucide-react";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefPageHeader } from "@/components/chef-page-header";
import { useChefReadPanels } from "@/hooks/use-chef-read-panels";
import { parseChefApplication } from "@/lib/chef-application-contract";
import { parseChefKitchen } from "@/lib/chef-kitchen-contract";

const profileSources = {
  application: {
    path: "/api/chef/application",
    label: "Personal details",
    decode: (raw: unknown) => {
      const value = parseChefApplication(raw);
      if (!value) throw new Error("Chef application details are unavailable. Please try again.");
      return value;
    },
  },
  kitchen: {
    path: "/api/chef/kitchen",
    label: "Kitchen details",
    decode: (raw: unknown) => {
      if (raw === null) return null;
      const value = parseChefKitchen(raw);
      if (!value) throw new Error("Kitchen details are unavailable. Please try again.");
      return value;
    },
  },
};

function ProfileContent() {
  const { panels, refresh } = useChefReadPanels(profileSources);
  const application = panels.application.data;
  const kitchen = panels.kitchen.data;
  const errors = [panels.application, panels.kitchen].filter((panel) => panel.status === "error");
  const name =
    panels.application.status === "loading"
      ? "Loading chef details…"
      : panels.application.status === "error"
        ? "Chef details unavailable"
        : [application?.firstName, application?.lastName].filter(Boolean).join(" ") || "Chef";
  const address = [
    kitchen?.addressLine1,
    kitchen?.addressLine2,
    kitchen?.areaName,
    kitchen?.city,
    kitchen?.state,
    kitchen?.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
  const kitchenName =
    panels.kitchen.status === "loading"
      ? "Loading kitchen details…"
      : panels.kitchen.status === "error"
        ? "Kitchen details unavailable"
        : kitchen?.kitchenName || "Add your kitchen details";
  const kitchenAddress =
    panels.kitchen.status === "loading"
      ? "Loading kitchen location…"
      : panels.kitchen.status === "error"
        ? "Kitchen location unavailable"
        : address || "Add your pickup location";
  const verification =
    panels.application.status === "loading"
      ? "Checking application status…"
      : panels.application.status === "error"
        ? "Application status unavailable"
        : application?.status === "APPROVED"
          ? "Application approved"
          : "View your verification status";
  const items = [
    { href: "/chef/application", icon: UserRound, title: "Personal details", desc: name },
    { href: "/chef/kitchen", icon: Store, title: "Kitchen details", desc: kitchenName },
    { href: "/chef/kitchen", icon: MapPin, title: "Kitchen location", desc: kitchenAddress },
    {
      href: "/chef/earnings",
      icon: BadgeIndianRupee,
      title: "Earnings & payouts",
      desc: "See what you get from completed orders",
    },
    {
      href: "/chef/meal-plans",
      icon: CalendarDays,
      title: "Meal Plans",
      desc: "Manage your dishes, schedules and availability",
    },
    {
      href: "/notifications",
      icon: Bell,
      title: "Notifications",
      desc: "Orders, payments and account updates",
    },
    {
      href: "/chef/application",
      icon: FileCheck2,
      title: "Documents & verification",
      desc: verification,
    },
  ];
  return (
    <div className="space-y-5">
      {errors.length > 0 && (
        <section className="rounded-3xl border border-error/20 bg-white p-6">
          <div role="alert">
            {errors.map((panel) => (
              <p key={panel.error}>{panel.error}</p>
            ))}
          </div>
          <button
            type="button"
            onClick={refresh}
            className="mt-4 min-h-12 rounded-md bg-primary px-5 text-white"
          >
            Try again
          </button>
        </section>
      )}
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--color-flame-red)]/10 text-[var(--color-flame-red)]">
            <UserRound className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-flame-red)]">Chef profile</p>
            <h2 className="mt-1 text-2xl font-bold text-[#1A1A1A]">{name}</h2>
            <p className="mt-1 text-sm text-[#6B6B6B]">
              {kitchenName} · {verification}
            </p>
          </div>
        </div>
      </section>
      <section className="overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href + item.title}
              href={item.href}
              className={`flex min-h-[76px] items-center gap-4 px-5 py-4 transition hover:bg-[#F7F8F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-flame-red)] sm:px-6 ${index ? "border-t border-[#E5E7EB]" : ""}`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[var(--color-flame-red)]">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-[#1A1A1A]">{item.title}</strong>
                <span className="mt-1 block truncate text-sm text-[#6B6B6B]">{item.desc}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true" />
            </Link>
          );
        })}
      </section>
      <section className="grid gap-3 sm:grid-cols-2" aria-label="Additional verification">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <h3 className="font-semibold">Food safety details</h3>
          <p className="mt-2 text-sm text-[#6B6B6B]">
            FSSAI submission is not available yet. Chef identity approval does not confirm
            food-business compliance.
          </p>
        </div>
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <h3 className="font-semibold">Kitchen photos</h3>
          <p className="mt-2 text-sm text-[#6B6B6B]">
            Kitchen photo uploads are not available yet.
          </p>
        </div>
      </section>
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm text-[#6B6B6B]">
        <p className="font-semibold text-[#1A1A1A]">Keep your details current</p>
        <p className="mt-1 leading-6">
          Customers see your kitchen information, while payout and verification information stays
          protected behind your signed-in Chef access.
        </p>
      </section>
    </div>
  );
}

export default function ChefProfilePage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <ChefPageHeader
        eyebrow="Your account"
        title="Profile"
        description="Keep your personal details, kitchen information, documents and payout links easy to find."
      />
      <div className="mt-6">
        <ChefAccessBoundary>
          <ProfileContent />
        </ChefAccessBoundary>
      </div>
    </main>
  );
}
