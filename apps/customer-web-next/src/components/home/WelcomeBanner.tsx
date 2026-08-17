import { Heart, MapPin, Sparkles, UtensilsCrossed } from "lucide-react";

import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

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
    <section
      className={`${styles.fadeUp} mx-auto max-w-[88rem] px-4 pt-5 md:px-7 lg:px-10`}
      aria-labelledby="discovery-heading"
    >
      <div className="relative min-h-[27rem] overflow-hidden rounded-[2rem] border border-[#E5E7EB] bg-white shadow-[0_22px_70px_rgba(26,26,26,0.08)] md:min-h-[31rem] lg:min-h-[34rem]">
        <img
          src="/home/reference/home-hero-reference.webp"
          alt="A mother and child preparing vegetables together in a warm home kitchen."
          className={`${styles.heroArtwork} absolute inset-0 h-full w-full object-cover object-[68%_50%] sm:object-center`}
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.99)_0%,rgba(255,255,255,0.96)_29%,rgba(255,255,255,0.64)_48%,rgba(255,255,255,0.08)_70%)] sm:bg-[linear-gradient(90deg,rgba(255,255,255,0.99)_0%,rgba(255,255,255,0.92)_31%,rgba(255,255,255,0.34)_55%,rgba(255,255,255,0)_74%)]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white/70 to-transparent" />

        <div className="relative z-10 flex min-h-[27rem] max-w-[43rem] flex-col justify-center px-6 py-10 sm:px-9 md:min-h-[31rem] md:px-12 lg:min-h-[34rem] lg:px-16">
          <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-[#E5E7EB] bg-white/90 px-3.5 py-2 text-[0.68rem] font-black uppercase tracking-[0.13em] text-[#1A1A1A] backdrop-blur-sm">
            <Heart className="h-3.5 w-3.5 fill-[#F62E18] text-[#F62E18]" aria-hidden="true" />
            Welcome home, {firstName}
          </div>

          <h1
            id="discovery-heading"
            className="max-w-[39rem] font-display text-[2.65rem] font-black leading-[0.98] tracking-[-0.055em] text-[#1A1A1A] sm:text-5xl md:text-6xl lg:text-[4.35rem]"
          >
            Eat for health.
            <br />
            Taste the <span className="text-[#F62E18]">comfort of home.</span>
          </h1>

          <p className="mt-5 max-w-lg text-sm font-medium leading-6 text-[#6B6B6B] sm:text-base sm:leading-7">
            Fresh food from nearby home kitchens, made with familiar ingredients,
            personal recipes and the kind of care that feels like home.
          </p>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white/92 px-3.5 py-2 text-xs font-bold text-[#1A1A1A] backdrop-blur-sm">
              <UtensilsCrossed className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
              {dishCount} live {dishCount === 1 ? "dish" : "dishes"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white/92 px-3.5 py-2 text-xs font-bold text-[#1A1A1A] backdrop-blur-sm">
              {hasAddress ? (
                <MapPin className="h-4 w-4 fill-[#F62E18] text-[#F62E18]" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
              )}
              {radiusLabel ?? "Choose delivery location"}
            </span>
          </div>
        </div>

        <div className="absolute bottom-5 right-5 z-10 hidden items-center gap-2 rounded-full bg-[#1A1A1A]/90 px-4 py-2 text-xs font-bold text-white backdrop-blur-md md:flex">
          <Heart className="h-3.5 w-3.5 fill-[#F62E18] text-[#F62E18]" aria-hidden="true" />
          Homemade. Nearby. Made with care.
        </div>
      </div>
    </section>
  );
}

export default WelcomeBanner;
