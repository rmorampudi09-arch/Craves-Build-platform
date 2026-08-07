import {
  ArrowRight,
  ChefHat,
  MapPin,
  Menu,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { CravesLogo } from "@/components/brand/CravesLogo";

interface HeroSectionProps {
  locationLabel: string;
  onOpenLocation: () => void;
  onOpenAuth: (mode: "login" | "register") => void;
  onBecomeChef: () => void;
}

const links = [
  { href: "#why-craves", label: "Why Craves" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#become-a-chef", label: "Become a chef" },
] as const;

/** Public landing hero. Business records are never fabricated on this surface. */
export function HeroSection({
  locationLabel,
  onOpenLocation,
  onOpenAuth,
  onBecomeChef,
}: HeroSectionProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section className="relative isolate overflow-hidden bg-white text-black">
      <header className="relative z-30 border-b border-border bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center gap-4 px-4 md:px-6">
          <a href="#top" className="flex items-center gap-3" aria-label="Craves home">
            <CravesLogo size="md" priority />
            <span className="hidden sm:block">
              <span className="block font-display text-xl font-bold tracking-[-0.04em] text-black">
                Craves
              </span>
              <span className="block text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-black/60">
                Food from home
              </span>
            </span>
          </a>

          <nav className="ml-auto hidden items-center gap-8 lg:flex" aria-label="Public navigation">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="min-h-11 content-center text-sm font-semibold text-black/75 transition-colors hover:text-[#C92716]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-3 sm:flex lg:ml-5">
            <button
              type="button"
              onClick={() => onOpenAuth("login")}
              className="min-h-11 rounded-lg border px-4 text-sm"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth("register")}
              className="btn-primary min-h-11 px-5"
            >
              Create account
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg border sm:hidden"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <nav className="border-t border-border bg-white px-4 py-4 sm:hidden" aria-label="Mobile public navigation">
            <div className="mx-auto grid max-w-7xl gap-2">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="min-h-11 rounded-lg px-3 py-3 text-sm font-semibold text-black hover:bg-grey-50"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onOpenAuth("login")}
                  className="min-h-11 rounded-lg border text-sm"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth("register")}
                  className="btn-primary min-h-11"
                >
                  Join Craves
                </button>
              </div>
            </div>
          </nav>
        )}
      </header>

      <div id="top" className="relative min-h-[42rem] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-70"
          style={{
            backgroundImage:
              "url('/landing/craves-chef-hero-reference.jpg')",
          }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-white/60" aria-hidden="true" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-5 select-none text-center font-display text-[clamp(8rem,24vw,22rem)] font-bold leading-none tracking-[-0.08em]"
          style={{ color: "rgba(246, 46, 24, 0.08)" }}
        >
          craves
        </div>

        <div className="relative z-10 mx-auto grid min-h-[42rem] max-w-7xl items-center px-4 py-16 md:px-6 lg:grid-cols-[minmax(0,42rem)_1fr] lg:py-24">
          <div>
            <p className="craves-overline flex items-center gap-2 text-[#C92716]">
              <Sparkles className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
              Trusted home-chef marketplace
            </p>
            <h1 className="mt-5 max-w-3xl font-display text-5xl font-bold leading-[1.04] tracking-[-0.055em] text-black md:text-6xl lg:text-7xl">
              Homemade food,
              <span className="block text-[#C92716]">closer than you think.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-black/70 md:text-lg md:leading-8">
              Discover active kitchens and available dishes around your saved delivery address. Every menu item, price and kitchen shown after sign-in comes from the Craves backend.
            </p>

            <div className="mt-8 flex max-w-xl flex-col gap-3 rounded-2xl border border-grey-200 bg-white/90 p-3 shadow-[var(--shadow-card)] sm:flex-row">
              <button
                type="button"
                onClick={onOpenLocation}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-4 text-left text-sm"
              >
                <MapPin className="h-5 w-5 shrink-0 text-[#C92716]" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[0.68rem] uppercase tracking-[0.08em] text-black/55">
                    Delivery area
                  </span>
                  <span className="block truncate text-black">{locationLabel}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth("register")}
                className="btn-primary min-h-12 shrink-0 px-6"
              >
                Start ordering <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-xl border border-grey-200 bg-white/90 p-4 text-black shadow-[var(--shadow-card)]">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#C92716]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-black">Phone-first secure access</p>
                  <p className="mt-1 text-xs leading-5 text-black/65">Firebase OTP verifies the number; Craves controls roles and sessions.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onBecomeChef}
                className="flex min-h-20 items-start gap-3 rounded-xl border border-grey-200 bg-white/90 p-4 text-left shadow-[var(--shadow-card)]"
              >
                <ChefHat className="mt-0.5 h-5 w-5 shrink-0 text-[#C92716]" aria-hidden="true" />
                <span>
                  <span className="block text-sm text-black">Cook with Craves</span>
                  <span className="mt-1 block text-xs leading-5 text-black/65">Apply as a home chef and continue after admin approval.</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
