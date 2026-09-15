import Image from "next/image";
import { Heart } from "lucide-react";
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
}: WelcomeBannerProps) {
  return (
    <section
      className={`${styles.fadeUp} mx-auto max-w-[88rem] px-4 pt-5 md:px-7 lg:px-10`}
      aria-labelledby="discovery-heading"
    >
      <div className={`${styles.heroShell} relative overflow-hidden rounded-[1.65rem] border border-[#E5E7EB] bg-white shadow-[0_22px_70px_rgba(26,26,26,0.08)] sm:rounded-[2rem]`}>
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

        <div className={`${styles.heroContent} relative z-10 flex max-w-[43rem] flex-col justify-center px-5 py-8 sm:px-9 sm:py-10 md:px-12 lg:px-16`}>
          <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-[#E5E7EB] bg-white/90 px-3.5 py-2 text-[0.68rem] font-black uppercase tracking-[0.13em] text-[#1A1A1A] backdrop-blur-sm">
            <Heart className="h-3.5 w-3.5 fill-[#F62E18] text-[#F62E18]" aria-hidden="true" />
            Welcome home, {firstName}
          </div>

          <h1
            id="discovery-heading"
            className="max-w-[39rem] font-display text-[clamp(2.15rem,5.1vw,4.35rem)] font-black leading-[0.99] tracking-[-0.05em] text-[#1A1A1A]"
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
          </div>
        </div>
      </div>
    </section>
  );
}

export default WelcomeBanner;
