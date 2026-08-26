import Image from "next/image";
import { Check, ChevronRight, Heart, MapPin } from "lucide-react";
import { FaUtensils } from "react-icons/fa6";

import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

interface WelcomeBannerProps {
  firstName: string;
  dishCount: number;
  radiusLabel: string | null;
  defaultAddressLabel: string;
  hasDefaultAddress: boolean;
  onManageDefaultAddress: () => void;
}

export function WelcomeBanner({
  firstName,
  dishCount,
  radiusLabel,
  defaultAddressLabel,
  hasDefaultAddress,
  onManageDefaultAddress,
}: WelcomeBannerProps) {
  return (
    <section
      className={`${styles.fadeUp} mx-auto max-w-[88rem] px-4 pt-5 md:px-7 lg:px-10`}
      aria-labelledby="discovery-heading"
    >
      <div className="relative min-h-[27rem] overflow-hidden rounded-[2rem] border border-[#E5E7EB] bg-white shadow-[0_22px_70px_rgba(26,26,26,0.08)] md:min-h-[31rem] lg:min-h-[34rem]">
        <Image
          src="/home/reference/home-hero-reference.webp"
          alt="A mother and child preparing vegetables together in a warm home kitchen."
          fill
          priority
          unoptimized
          sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), (min-width: 768px) calc(100vw - 56px), calc(100vw - 32px)"
          className={`${styles.heroArtwork} object-cover`}
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
            Eat for Health.
            <br />
            <span className="text-[#F62E18]">Taste the Comfort of Home.</span>
          </h1>

          <p className="mt-5 max-w-lg text-sm font-medium leading-6 text-[#6B6B6B] sm:text-base sm:leading-7">
            Fresh food from nearby home kitchens, made with familiar ingredients,
            personal recipes and the kind of care that feels like home.
          </p>

          <div className="mt-7 flex flex-wrap items-stretch gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3.5 py-2 text-xs font-bold text-[#1A1A1A]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                <FaUtensils className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              {dishCount} live {dishCount === 1 ? "dish" : "dishes"}
            </span>

            <button
              type="button"
              onClick={onManageDefaultAddress}
              className="group inline-flex min-h-12 max-w-full items-center gap-2.5 rounded-full border border-[#E5E7EB] bg-white px-3 py-2 text-left shadow-[0_5px_16px_rgba(26,26,26,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#F62E18]/25 hover:shadow-[0_10px_24px_rgba(26,26,26,0.09)]"
              aria-label={hasDefaultAddress ? `Default delivery address: ${defaultAddressLabel}. Change address` : "Choose default delivery address"}
            >
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {hasDefaultAddress ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#F62E18] text-white ring-2 ring-white">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 max-w-[15rem] sm:max-w-[20rem]">
                <span className="block text-[0.58rem] font-black uppercase tracking-[0.12em] text-[#6B6B6B]">
                  {hasDefaultAddress ? "Default address" : "Delivery address"}
                </span>
                <span className="block truncate text-xs font-black text-[#1A1A1A]">
                  {hasDefaultAddress
                    ? `${defaultAddressLabel}${radiusLabel ? ` · ${radiusLabel}` : ""}`
                    : "Choose default address"}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#6B6B6B] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default WelcomeBanner;
