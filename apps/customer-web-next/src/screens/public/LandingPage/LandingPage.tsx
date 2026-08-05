import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthModal, type AccountMode } from "@/components/auth/AuthModal";
import { LocationModal } from "@/components/layout/LocationModal";
import { HeroSection } from "@/components/sections/HeroSection";
import { WhyCravesSection } from "@/components/sections/WhyCravesSection";
import { HowItWorksSection } from "@/components/sections/HowItWorksSection";
import { WhatMakesSpecialSection } from "@/components/sections/WhatMakesSpecialSection";
import { BecomeChefCtaSection } from "@/components/sections/BecomeChefCtaSection";
import { FooterSection } from "@/components/sections/FooterSection";
import {
  getAddress,
  loadSession,
  type CravesAddress,
  type CravesUser,
} from "@/services/auth/cravesAuth";

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
      <main className="flex min-h-screen items-center justify-center bg-cream px-4">
        <div className="text-center" role="status" aria-live="polite">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            Opening Craves…
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
      <main>
        <HeroSection
          locationLabel={locationLabel}
          onOpenLocation={() => setLocOpen(true)}
          onOpenAuth={openAuth}
          onBecomeChef={() => openAuth("register", "chef")}
        />
        <div id="why-craves" className="scroll-mt-20">
          <WhyCravesSection />
        </div>
        <div id="how-it-works" className="scroll-mt-20">
          <HowItWorksSection />
        </div>
        <WhatMakesSpecialSection />
        <div id="become-a-chef" className="scroll-mt-20">
          <BecomeChefCtaSection
            onBecomeChef={() => openAuth("register", "chef")}
          />
        </div>
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
