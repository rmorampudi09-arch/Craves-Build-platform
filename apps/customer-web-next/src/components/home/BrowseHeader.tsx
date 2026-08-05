import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  CalendarRange,
  ChefHat,
  ClipboardList,
  Home,
  LogOut,
  MapPin,
  Search,
  ShoppingCart,
  UserCircle,
} from "lucide-react";
import { CravesLogo } from "@/components/brand/CravesLogo";
import type { CravesUser } from "@/services/auth/cravesAuth";

interface BrowseHeaderProps {
  user: CravesUser;
  locationLabel: string;
  onOpenLocation: () => void;
  cartCount: number;
  onOpenCart: () => void;
  onLogout: () => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

const serviceLinks = [
  { to: "/home", label: "Discover", icon: Home },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/subscriptions", label: "Meal plans", icon: CalendarRange },
  { to: "/notifications", label: "Updates", icon: Bell },
  { to: "/chef", label: "Chef mode", icon: ChefHat },
] as const;

export function BrowseHeader({
  user,
  locationLabel,
  onOpenLocation,
  cartCount,
  onOpenCart,
  onLogout,
  searchTerm,
  onSearchTermChange,
}: BrowseHeaderProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const firstName = user.firstName || user.username.split(" ")[0] || "there";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/95 shadow-[0_1px_0_rgba(38,26,21,0.04)] backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex min-h-18 items-center gap-3 py-3">
          <Link to="/home" className="flex min-h-11 shrink-0 items-center gap-3 rounded-lg pr-2" aria-label="Craves discovery home">
            <CravesLogo size="md" />
            <span className="hidden leading-tight sm:block">
              <span className="block font-display text-xl font-bold tracking-[-0.04em] text-ink">Craves</span>
              <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Food from home</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={onOpenLocation}
            className="hidden min-h-11 min-w-0 max-w-xs items-center gap-2 rounded-lg border border-border bg-cream px-3 text-left text-sm text-ink transition-colors hover:border-primary md:flex"
          >
            <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Deliver to</span>
              <span className="block truncate font-semibold">{locationLabel}</span>
            </span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm font-semibold text-ink lg:inline">Hi, {firstName}</span>
            <Link
              to="/profile"
              className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:border-primary"
            >
              <UserCircle className="h-5 w-5" aria-hidden="true" />
              <span className="hidden sm:inline">Profile</span>
            </Link>
            <button
              type="button"
              onClick={onOpenCart}
              className="relative flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-white shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5"
              aria-label={`Open cart${cartCount ? ` with ${cartCount} items` : ""}`}
            >
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              {cartCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[0.62rem] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="hidden h-11 w-11 items-center justify-center rounded-lg border border-border text-ink transition-colors hover:border-primary hover:text-primary lg:flex"
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 pb-3 lg:grid-cols-[minmax(18rem,1fr)_auto] lg:items-center">
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-cream px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Search dishes or kitchens</span>
            <input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Search dishes or home kitchens"
              className="w-full bg-transparent text-base text-ink outline-none placeholder:text-[#9A9A95]"
              type="search"
              autoComplete="off"
            />
          </label>

          <nav className="flex gap-2 overflow-x-auto pb-1 lg:pb-0" aria-label="Customer services">
            {serviceLinks.map((link) => {
              const active = pathname === link.to || (link.to !== "/home" && pathname.startsWith(link.to));
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                    active
                      ? "border-primary bg-secondary text-ink"
                      : "border-border bg-white text-muted-foreground hover:border-primary hover:text-ink"
                  }`}
                >
                  <link.icon className="h-4 w-4" aria-hidden="true" /> {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <button
          type="button"
          onClick={onOpenLocation}
          className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-cream px-3 text-left text-sm font-semibold text-ink md:hidden"
        >
          <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{locationLabel}</span>
        </button>
      </div>
    </header>
  );
}

export default BrowseHeader;
