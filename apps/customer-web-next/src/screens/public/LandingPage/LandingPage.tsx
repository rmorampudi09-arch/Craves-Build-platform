import { useNavigate } from "@tanstack/react-router";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import type { AccountMode } from "@/components/auth/AuthModal";
import { FooterSection } from "@/components/sections/FooterSection";
import { ReferenceArtworkSection } from "@/components/sections/landing-reference/ReferenceArtworkSection";
import { ReferenceHeroDesktop } from "@/components/sections/landing-reference/ReferenceHeroDesktop";
import {
  getAddress,
  loadSession,
  type CravesAddress,
  type CravesUser,
} from "@/services/auth/cravesAuth";
import styles from "./LandingV2.module.css";

const AuthModal = dynamic(
  () => import("@/components/auth/AuthModal").then((module) => module.AuthModal),
  { ssr: false },
);

const LocationModal = dynamic(
  () => import("@/components/layout/LocationModal").then((module) => module.LocationModal),
  { ssr: false },
);

export const routeMeta = {};

function hasChefRole(user: CravesUser): boolean {
  return user.roles.some((role) => role.toUpperCase() === "CHEF");
}

function LandingPage() {
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authAccountMode, setAuthAccountMode] =
    useState<AccountMode>("customer");
  const [authAccountLocked, setAuthAccountLocked] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [address, setAddress] = useState<CravesAddress | null>(null);

  useEffect(() => {
    let active = true;
    setAddress(getAddress());
    void loadSession({ hydrateCustomerProfile: "background" })
      .then((current) => {
        if (active && current) navigate({ to: "/home", replace: true });
      })
      .catch(() => {
        // The public page remains usable while the session service reconnects.
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  const openAuth = (
    mode: "login" | "register",
    accountMode: AccountMode = "customer",
    lockAccountMode = false,
  ) => {
    setAuthMode(mode);
    setAuthAccountMode(accountMode);
    setAuthAccountLocked(lockAccountMode);
    setAuthOpen(true);
  };

  const locationLabel = address
    ? [address.mandal, address.city].filter(Boolean).join(", ")
    : "Choose your delivery location";

  return (
    <div className={`${styles.page} min-h-screen bg-white text-ink`}>
      <style>{`
        #top > div,
        #how-it-works,
        #why-craves,
        #become-a-chef {
          margin-inline: 1.1cm;
        }
      `}</style>

      <main>
        <ReferenceHeroDesktop
          locationLabel={locationLabel}
          onOpenLocation={() => setLocOpen(true)}
          onOpenAuth={(mode) => openAuth(mode, "customer", false)}
          onOrderFood={() => openAuth("login", "customer", true)}
          onBecomeChef={() => openAuth("register", "chef", true)}
        />

        <div id="how-it-works" className="scroll-mt-20">
          <ReferenceArtworkSection variant="how" />
        </div>

        <div id="why-craves" className="scroll-mt-20">
          <ReferenceArtworkSection variant="why" />
        </div>

        <div id="become-a-chef" className="scroll-mt-20">
          <ReferenceArtworkSection
            variant="chefs-app"
            onBecomeChef={() => openAuth("register", "chef", true)}
          />
        </div>
      </main>

      <FooterSection />

      <div
        data-auth-context={authAccountMode}
        className="[&>div]:bg-black/25 [&>div]:backdrop-blur-xl [&>div]:backdrop-saturate-150 [&_[role=dialog]]:border-white/70 [&_[role=dialog]]:bg-white [&_[role=dialog]]:shadow-[0_28px_90px_rgba(17,17,17,0.24)] [&_[role=dialog]]:backdrop-blur-2xl [&_[role=dialog]]:backdrop-saturate-150 [&_[aria-pressed=true]]:!border-[#F62E18] [&_[aria-pressed=true]]:!bg-[#F62E18] [&_[aria-pressed=true]]:!text-white"
      >
        {authOpen ? <AuthModal
          open={authOpen}
          mode={authMode}
          initialAccountMode={authAccountMode}
          lockAccountMode={authAccountLocked}
          onClose={() => setAuthOpen(false)}
          onSwitchMode={setAuthMode}
          onAuthenticated={(authenticatedUser, accountMode) => {
            navigate({
              to:
                accountMode === "chef"
                  ? hasChefRole(authenticatedUser)
                    ? "/chef"
                    : "/chef/application"
                  : "/home",
            });
          }}
        /> : null}
      </div>

      {locOpen ? <LocationModal
        open={locOpen}
        onClose={() => setLocOpen(false)}
        onSaved={(savedAddress) => {
          setAddress(savedAddress);
          setLocOpen(false);
        }}
      /> : null}
    </div>
  );
}

export default LandingPage;
