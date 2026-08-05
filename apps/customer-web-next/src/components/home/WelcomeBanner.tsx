import { ChefHat, MapPinned, Utensils } from "lucide-react";

interface WelcomeBannerProps {
  firstName: string;
  dishCount: number;
  radiusLabel: string | null;
  hasAddress: boolean;
}

export function WelcomeBanner({
  firstName,
  dishCount,
  radiusLabel,
  hasAddress,
}: WelcomeBannerProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 md:px-6" aria-labelledby="discovery-heading">
      <div className="relative overflow-hidden rounded-2xl bg-ink px-6 py-8 text-white shadow-[var(--shadow-card)] md:px-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="craves-overline text-[#F5B400]">Welcome back, {firstName}</p>
            <h1 id="discovery-heading" className="mt-3 max-w-3xl font-display text-3xl font-bold leading-tight tracking-[-0.04em] md:text-4xl">
              {hasAddress
                ? dishCount > 0
                  ? "Fresh dishes available around your delivery address."
                  : "We’re checking nearby home kitchens for you."
                : "Add a mapped delivery address to discover nearby food."}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 md:text-base">
              Kitchen names, dishes, availability and prices below are loaded from the live Craves catalog. Final delivery availability is confirmed during checkout.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:min-w-[20rem]">
            <div className="rounded-xl border border-white/15 bg-white/5 p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/60">
                <Utensils className="h-4 w-4 text-[#F5B400]" aria-hidden="true" /> Dishes
              </dt>
              <dd className="mt-2 font-display text-2xl font-bold">{dishCount}</dd>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/5 p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/60">
                {hasAddress ? <MapPinned className="h-4 w-4 text-[#F5B400]" aria-hidden="true" /> : <ChefHat className="h-4 w-4 text-[#F5B400]" aria-hidden="true" />}
                Radius
              </dt>
              <dd className="mt-2 font-display text-lg font-bold">{radiusLabel ?? "Address needed"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

export default WelcomeBanner;
