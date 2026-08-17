import { MapPinned, Sparkles, Utensils } from "lucide-react";

import heroFood from "@/assets/images/hero-food.jpg";

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
      <div className="relative min-h-[21rem] overflow-hidden rounded-[1.75rem] border border-[#F0E7E1] bg-[#FFF9F4] shadow-[0_16px_44px_rgba(51,36,30,0.08)] md:min-h-[24rem]">
        <img
          src={heroFood.src}
          alt="Homemade Indian food prepared in a warm home kitchen."
          className="absolute inset-0 h-full w-full object-cover object-center opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#FFF9F4] via-[#FFF9F4]/95 to-[#FFF9F4]/20 md:via-[#FFF9F4]/82" />

        <div className="relative z-10 flex min-h-[21rem] max-w-2xl flex-col justify-center px-6 py-10 md:min-h-[24rem] md:px-10 lg:px-12">
          <p className="text-sm font-semibold text-ink">Welcome back, {firstName}</p>
          <h1
            id="discovery-heading"
            className="mt-2 font-display text-4xl font-bold leading-[1.02] tracking-[-0.045em] text-[#111111] sm:text-5xl"
          >
            Welcome to <span className="text-[#F62E18]">Craves</span>
          </h1>
          <span className="mt-4 block h-1 w-16 rounded-full bg-[#F62E18]" aria-hidden="true" />
          <p className="mt-5 max-w-xl text-xl font-bold leading-7 text-[#F62E18] md:text-2xl">
            Eat for health, taste the comfort of home.
          </p>
          <p className="mt-3 max-w-lg text-sm leading-6 text-[#4F555A] md:text-base">
            Discover homemade meals from nearby home kitchens, prepared fresh and delivered to your doorstep.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#EADDD6] bg-white/90 px-3 py-2 text-xs font-semibold text-[#383D42] shadow-sm">
              <Utensils className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
              {dishCount} live {dishCount === 1 ? "dish" : "dishes"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#EADDD6] bg-white/90 px-3 py-2 text-xs font-semibold text-[#383D42] shadow-sm">
              {hasAddress ? (
                <MapPinned className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
              )}
              {radiusLabel ?? "Choose delivery location"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default WelcomeBanner;
