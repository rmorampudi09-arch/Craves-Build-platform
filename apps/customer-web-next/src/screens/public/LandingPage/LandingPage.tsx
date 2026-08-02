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

// Route metadata (head tags, etc.) consumed by src/routes/index.tsx
export const routeMeta = {};

/**
 * Public marketing landing page (the very first screen a signed-out visitor sees).
 * Composed entirely of named section components from src/components/sections/.
 * Post-login browsing lives at src/pages/public/BrowseFoods/BrowseFoods.tsx instead.
 */
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

  const openAuth = (m: "login" | "register") => {
    setAuthMode(m);
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
        onAuthenticated={(u) => {
          setUser(u);
          if (authMode === "register" || !getAddress()) {
            setLocOpen(true);
          } else {
            navigate({ to: "/home" });
          }
        }}
      />
      <LocationModal
        open={locOpen}
        onClose={() => setLocOpen(false)}
        onSaved={(a) => {
          setAddress(a);
          setLocOpen(false);
          // Once we have both a session and an address, send them to Home.
          if (user) navigate({ to: "/home" });
        }}
      />
    </div>
  );
}

export default LandingPage;
