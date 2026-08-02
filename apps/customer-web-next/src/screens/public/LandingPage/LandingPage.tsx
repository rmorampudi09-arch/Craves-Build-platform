import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  AuthModal,
  type AccountMode,
} from "@/components/auth/AuthModal";
import { LocationModal } from "@/components/layout/LocationModal";
import { HeroSection } from "@/components/sections/HeroSection";
import { WhyCravesSection } from "@/components/sections/WhyCravesSection";
import { HowItWorksSection } from "@/components/sections/HowItWorksSection";
import { WhatMakesSpecialSection } from "@/components/sections/WhatMakesSpecialSection";
import { BecomeChefCtaSection } from "@/components/sections/BecomeChefCtaSection";
import { TestimonialsSection } from "@/components/sections/TestimonialsSection";
import { StatsSection } from "@/components/sections/StatsSection";
import { FooterSection } from "@/components/sections/FooterSection";
import {
  getAddress,
  loadSession,
  clearSession,
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
  const [user, setUser] = useState<CravesUser | null>(null);
  const [address, setAddress] = useState<CravesAddress | null>(null);

  useEffect(() => {
    let active = true;
    void loadSession().then((current) => {
      if (!active) return;
      if (current) navigate({ to: "/home", replace: true });
      else {
        setUser(null);
        setAddress(getAddress());
      }
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

  const handleLogout = async () => {
    await clearSession();
    setUser(null);
  };

  const locationLabel = address
    ? `${address.city}${address.mandal ? `, ${address.mandal}` : ""}`
    : "Select Location";

  return (
    <div className="min-h-screen bg-cream">
      <HeroSection
        user={user}
        locationLabel={locationLabel}
        onOpenLocation={() => setLocOpen(true)}
        onOpenAuth={openAuth}
        onBecomeChef={() => openAuth("register", "chef")}
        onLogout={handleLogout}
      />
      <WhyCravesSection />
      <HowItWorksSection />
      <WhatMakesSpecialSection />
      <BecomeChefCtaSection
        onBecomeChef={() => openAuth("register", "chef")}
      />
      <TestimonialsSection />
      <StatsSection />
      <FooterSection />

      <AuthModal
        open={authOpen}
        mode={authMode}
        initialAccountMode={authAccountMode}
        onClose={() => setAuthOpen(false)}
        onSwitchMode={setAuthMode}
        onAuthenticated={(authenticatedUser, accountMode) => {
          setUser(authenticatedUser);
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
