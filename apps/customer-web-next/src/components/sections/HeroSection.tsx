import {
  MapPin,
  Search,
  ShoppingBag,
  ChefHat,
  ChevronDown,
  Heart,
} from "lucide-react";
import heroFood from "@/assets/images/hero-food.jpg";
import { Logo } from "@/components/layout/Logo";
import { navLinks } from "@/constants/landingContent";
import type { CravesUser } from "@/services/auth/cravesAuth";
import { assetUrl } from "@/lib/asset-url";

interface HeroSectionProps {
  user: CravesUser | null;
  locationLabel: string;
  onOpenLocation: () => void;
  onOpenAuth: (mode: "login" | "register") => void;
  onBecomeChef: () => void;
  onLogout: () => void;
}

/** Full-bleed hero: background image, top nav, search bar and CTA buttons. */
export function HeroSection({
  user,
  locationLabel,
  onOpenLocation,
  onOpenAuth,
  onBecomeChef,
  onLogout,
}: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden">
      <img
        src={assetUrl(heroFood)}
        alt="Sizzling homemade food"
        width={1920}
        height={1280}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        className="absolute inset-0"
        style={{ background: "var(--gradient-hero)" }}
      />

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Logo light />
        <nav className="hidden items-center gap-8 lg:flex">
          {navLinks.map((l, i) => (
            <a
              key={l}
              href="#"
              className={`text-sm font-medium transition-colors ${
                i === 0
                  ? "text-primary-glow"
                  : "text-white/90 hover:text-primary-glow"
              }`}
            >
              {l}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-sm font-medium text-white sm:inline">
                Hi, {user.username}
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenAuth("login")}
                className="rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth("register")}
                className="btn-primary text-sm"
              >
                Register
              </button>
            </>
          )}
        </div>
      </header>

      {/* Hero content */}
      <div className="relative z-10 mx-auto max-w-4xl px-6 pb-40 pt-16 text-center md:pt-24">
        <p className="font-script text-2xl text-primary-glow md:text-3xl">
          Good food, Made with love{" "}
          <Heart className="inline h-5 w-5 fill-primary-glow" />
        </p>
        <h1 className="mt-4 text-5xl font-bold leading-[1.05] text-white md:text-7xl">
          Homemade Meals,
          <br />
          Made with <span className="text-primary-glow">Love</span>{" "}
          <Heart className="inline h-12 w-12 fill-primary-glow text-primary-glow md:h-16 md:w-16" />
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-white/85 md:text-lg">
          Discover delicious home-cooked food prepared by trusted home chefs
          near you. Fast delivery to your doorstep.
        </p>

        {/* Search bar */}
        <div className="mx-auto mt-10 flex max-w-3xl flex-col items-stretch gap-2 rounded-2xl bg-white p-2 shadow-2xl md:flex-row md:items-center md:rounded-full">
          <button
            type="button"
            onClick={onOpenLocation}
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-left md:w-56 md:border-r md:border-border"
          >
            <MapPin className="h-5 w-5 text-primary" />
            <span className="truncate text-sm font-medium text-foreground">
              {locationLabel}
            </span>
          </button>
          <div className="flex flex-1 items-center gap-2 rounded-xl px-4 py-3">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search for dishes, cuisines..."
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          <button className="btn-primary justify-center rounded-xl md:rounded-full">
            Search
          </button>
        </div>

        {/* CTA buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button className="btn-primary">
            <ShoppingBag className="h-5 w-5" /> Order Food
          </button>
          <button
            type="button"
            onClick={onBecomeChef}
            className="btn-outline-light"
          >
            <ChefHat className="h-5 w-5" /> Become a Home Chef
          </button>
        </div>

        <div className="mt-16 flex flex-col items-center text-white/80">
          <span className="text-sm">Scroll Down</span>
          <ChevronDown className="mt-1 h-5 w-5 animate-bounce" />
        </div>
      </div>

      {/* Wave bottom */}
      <div
        className="absolute -bottom-1 left-0 right-0 h-24 bg-cream"
        style={{ clipPath: "ellipse(75% 100% at 50% 100%)" }}
      />
    </section>
  );
}

export default HeroSection;
