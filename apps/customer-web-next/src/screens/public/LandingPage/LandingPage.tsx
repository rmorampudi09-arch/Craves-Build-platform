import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthModal, type AccountMode } from "@/components/auth/AuthModal";
import { LocationModal } from "@/components/layout/LocationModal";
import { AppDownloadSection } from "@/components/sections/AppDownloadSection";
import { BecomeChefCtaSection } from "@/components/sections/BecomeChefCtaSection";
import { CommunityImpactSection } from "@/components/sections/CommunityImpactSection";
import { FooterSection } from "@/components/sections/FooterSection";
import { HeroSection } from "@/components/sections/HeroSection";
import { HowItWorksSection } from "@/components/sections/HowItWorksSection";
import { WhatMakesSpecialSection } from "@/components/sections/WhatMakesSpecialSection";
import { WhyCravesSection } from "@/components/sections/WhyCravesSection";
import {
  getAddress,
  loadSession,
  type CravesAddress,
  type CravesUser,
} from "@/services/auth/cravesAuth";
import styles from "./LandingV2.module.css";

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
  const [locOpen, setLocOpen] = useState(false);
  const [address, setAddress] = useState<CravesAddress | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    void loadSession().then((current) => {
      if (!active) return;
      if (current) {
        navigate({ to: "/home", replace: true });
        return;
      }
      setAddress(getAddress());
      setCheckingSession(false);
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  const openAuth = (
    mode: "login" | "register",
    accountMode: AccountMode = "customer",
  ) => {
    setAuthMode(mode);
    setAuthAccountMode(accountMode);
    setAuthOpen(true);
  };

  const locationLabel = address
    ? [address.mandal, address.city].filter(Boolean).join(", ")
    : "Choose your delivery location";

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="text-center" role="status" aria-live="polite">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#E6E8EA] border-t-[#F62E18]" />
          <p className="mt-4 text-sm font-medium text-[#6E7378]">Opening Craves…</p>
        </div>
      </main>
    );
  }

  return (
    <div className={`${styles.page} min-h-screen bg-white text-[#111111]`}>
      <main>
        <HeroSection
          locationLabel={locationLabel}
          onOpenLocation={() => setLocOpen(true)}
          onOpenAuth={openAuth}
          onBecomeChef={() => openAuth("register", "chef")}
        />

        <WhatMakesSpecialSection />

        <div id="how-it-works" className="scroll-mt-20">
          <HowItWorksSection />
        </div>

        <div id="why-craves" className="scroll-mt-20">
          <WhyCravesSection />
        </div>

        <div id="become-a-chef" className="scroll-mt-20">
          <BecomeChefCtaSection
            onBecomeChef={() => openAuth("register", "chef")}
          />
        </div>

        <CommunityImpactSection />
        <AppDownloadSection />
      </main>

      <FooterSection />

      <AuthModal
        open={authOpen}
        mode={authMode}
        initialAccountMode={authAccountMode}
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
      />

      <LocationModal
        open={locOpen}
        onClose={() => setLocOpen(false)}
        onSaved={(savedAddress) => {
          setAddress(savedAddress);
          setLocOpen(false);
        }}
      />
    </div>
  );
}

export default LandingPage;
