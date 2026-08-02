import { Heart, ChefHat, Flame } from "lucide-react";

/** "Welcome back, {name}!" gradient banner with the live-chefs/specials counters. */
export function WelcomeBanner({ firstName }: { firstName: string }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 md:px-6">
      <div
        className="flex flex-col justify-between gap-4 overflow-hidden rounded-2xl p-6 text-white md:flex-row md:items-center"
        style={{ background: "var(--gradient-primary)" }}
      >
        <div>
          <p className="font-script text-xl">Welcome back, {firstName}!</p>
          <h1 className="mt-1 font-display text-2xl font-bold md:text-3xl">
            Today&apos;s home kitchens are open <Heart className="ml-1 inline h-5 w-5 fill-white" />
          </h1>
          <p className="mt-1 text-sm text-white/90">
            Freshly cooked meals, biryanis and curries — made by trusted home chefs near you.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <ChefHat className="h-5 w-5" /> Nearby home chefs
          </div>
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5" /> Freshly prepared
          </div>
        </div>
      </div>
    </section>
  );
}

export default WelcomeBanner;
