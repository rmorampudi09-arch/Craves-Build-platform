"use client";

import { useEffect, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, ChevronRight, FileText, Headset, Info, LockKeyhole, MapPin, ShieldCheck } from "lucide-react";
import { useCustomerSignOut } from "@/features/profile/components/SignOutFlow";
import { getSession, loadSession, subscribeSession } from "@/features/auth/api/cravesAuth";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";

type Row = { to: string; icon: ComponentType<{ className?: string }>; title: string; subtitle?: string };

const ACCOUNT: Row[] = [
  { to: "/security", icon: ShieldCheck, title: "Privacy & security", subtitle: "How Craves keeps your account and payments safe" },
  { to: "/addresses", icon: MapPin, title: "Saved addresses", subtitle: "Home, Work and others" },
  { to: "/notifications", icon: Bell, title: "Notifications", subtitle: "Order and meal plan updates" },
];
const SUPPORT: Row[] = [
  { to: "/help", icon: Headset, title: "Help & support" },
  { to: "/terms", icon: FileText, title: "Terms & conditions" },
  { to: "/privacy", icon: LockKeyhole, title: "Privacy policy" },
];
const ROW = "flex min-h-[4.25rem] items-center gap-3 px-4 py-3";

/** The web build ("Version 1a2b3c4") from /api/version; nothing when the build doesn't say. */
function useBuildVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/version", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        const sha = body && typeof body === "object" ? (body as { commitSha?: unknown }).commitSha : null;
        if (live && typeof sha === "string" && /^[0-9a-f]{40}$/i.test(sha)) setVersion(`Version ${sha.slice(0, 7)}`);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return version;
}

function RowIcon({ icon: Icon }: { icon: Row["icon"] }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDEAE8] text-[#D92714]">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

function Section({ title, rows, children }: { title: string; rows: Row[]; children?: ReactNode }) {
  const id = `settings-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="mt-7">
      <h2 id={id} className="mb-2 px-1 text-sm font-bold text-[#6B6B6B]">
        {title}
      </h2>
      <ul className="overflow-hidden rounded-[20px] border border-[#E5E7EB] bg-white">
        {rows.map(({ to, icon, title: rowTitle, subtitle }) => (
          <li key={to}>
            <Link to={to} className={`${ROW} transition-colors hover:bg-[#F7F5F3] focus-visible:!-outline-offset-2`}>
              <RowIcon icon={icon} />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-[#1A1A1A]">{rowTitle}</span>
                {subtitle ? <span className="block text-sm text-[#6B6B6B]">{subtitle}</span> : null}
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#7D7570]" aria-hidden="true" />
            </Link>
          </li>
        ))}
        {children}
      </ul>
    </section>
  );
}

/** Settings, like the app: account, support and legal, the build, and Log out. */
export default function SettingsPage() {
  const signOut = useCustomerSignOut();
  const version = useBuildVersion();
  const signedIn = useSyncExternalStore(subscribeSession, () => getSession() !== null, () => false);

  // A direct visit learns who is signed in, so Log out shows only for them.
  useEffect(() => {
    void loadSession().catch(() => null);
  }, []);

  return (
    <div className="min-h-screen bg-white pb-24 text-[#1A1A1A]">
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 md:px-6">
          <Link
            to="/profile"
            aria-label="Back to profile"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">Settings</h1>
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-2xl px-4 pb-8 md:px-6">
        <Section title="Account" rows={ACCOUNT} />
        <Section title="Support & legal" rows={SUPPORT}>
          <li className={ROW}>
            <RowIcon icon={Info} />
            <span className="min-w-0 flex-1 text-base font-semibold">About Craves</span>
            {version ? <span className="shrink-0 text-sm text-[#6B6B6B]">{version}</span> : null}
          </li>
        </Section>

        {signedIn ? (
          <button
            type="button"
            onClick={signOut.ask}
            className="mt-8 flex min-h-12 w-full items-center justify-center rounded-full !border !border-[#E5E7EB] !bg-white text-base font-bold !text-[#D92714] !shadow-none hover:!bg-[#FDEAE8]"
          >
            Log out
          </button>
        ) : null}
      </main>
      {signOut.dialog}
    </div>
  );
}
