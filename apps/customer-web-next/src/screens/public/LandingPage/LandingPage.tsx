import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthModal } from "@/components/auth/AuthModal";
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

function LandingPage() {
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
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
    return () => { active = false; };
  }, [navigate]);

  const openAuth = (mode: "login" | "register") => {
    setAuthMode(mode);
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
        onLogout={handleLogout}
      />
      <WhyCravesSection />
      <HowItWorksSection />
      <WhatMakesSpecialSection />
      <BecomeChefCtaSection />
      <TestimonialsSection />
      <StatsSection />
      <FooterSection />

      <AuthModal
        open={authOpen}
        mode={authMode}
        onClose={() => setAuthOpen(false)}
        onSwitchMode={setAuthMode}
        onAuthenticated={(authenticatedUser, accountMode) => {
          setUser(authenticatedUser);
          navigate({ to: accountMode === "chef" ? "/chef" : "/home" });
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
