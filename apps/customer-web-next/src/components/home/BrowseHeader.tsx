import { Link } from "@tanstack/react-router";
import {
  Bell,
  CalendarRange,
  ChefHat,
  ClipboardList,
  Heart,
  Home,
  LogOut,
  MapPin,
  Search,
  ShoppingCart,
  UserCircle,
} from "lucide-react";
import cravesLogo from "@/assets/images/craves-logo.png";
import type { CravesUser } from "@/services/auth/cravesAuth";
import { assetUrl } from "@/lib/asset-url";

interface BrowseHeaderProps {
  user: CravesUser;
  locationLabel: string;
  onOpenLocation: () => void;
  cartCount: number;
  onOpenCart: () => void;
  wishlistCount: number;
  onLogout: () => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

const serviceLinks = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/subscriptions", label: "Meal plans", icon: CalendarRange },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/chef", label: "Chef mode", icon: ChefHat },
];

export function BrowseHeader({
  user,
  locationLabel,
  onOpenLocation,
  cartCount,
  onOpenCart,
  wishlistCount,
  onLogout,
  searchTerm,
  onSearchTermChange,
}: BrowseHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <img
            src={assetUrl(cravesLogo)}
            alt="Craves"
            width={40}
            height={40}
            className="h-10 w-10"
          />
          <div className="leading-tight">
            <div className="font-display text-xl font-bold text-primary">
              Craves
            </div>
            <div className="text-[9px] font-medium tracking-[0.2em] text-primary/70">
              FOOD FROM HOME
            </div>
          </div>
        </Link>
        <button
          type="button"
          onClick={onOpenLocation}
          className="ml-2 hidden max-w-xs items-center gap-2 rounded-full border border-border bg-white px-3 py-2 text-left text-xs text-ink hover:border-primary md:flex"
        >
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{locationLabel}</span>
        </button>
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <span className="hidden text-sm font-semibold text-ink sm:inline">
            Hi, {user.username.split(" ")[0]}
          </span>
          <Link
            to="/wishlist"
            className="relative rounded-full border border-border bg-white p-2.5 text-ink hover:border-primary"
            aria-label="Open wishlist"
          >
            <Heart className="h-4 w-4" />
            {wishlistCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {wishlistCount}
              </span>
            )}
          </Link>
          <Link
            to="/profile"
            className="flex items-center gap-1 rounded-full border border-border bg-white px-3 py-2 text-xs font-semibold text-ink hover:border-primary"
          >
            <UserCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="hidden rounded-full border border-border bg-white p-2.5 text-ink hover:border-primary sm:flex"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onOpenCart}
            className="relative rounded-full bg-primary p-2.5 text-primary-foreground shadow-md transition-transform hover:scale-105"
            aria-label="Open cart"
          >
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-3 md:px-6">
        <div className="flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2.5 shadow-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Search biryanis, meals, home chefs…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground"
          />
        </div>
        <nav
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
          aria-label="Craves services"
        >
          {serviceLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-3 py-2 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary"
            >
              <link.icon className="h-3.5 w-3.5" /> {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export default BrowseHeader;
