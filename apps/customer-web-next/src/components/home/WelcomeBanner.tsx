import Image from "next/image";
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
      className={styles.fadeUp + " mx-auto max-w-[88rem] px-4 pt-4 md:px-7 md:pt-5 lg:px-10"}
      aria-labelledby="discovery-heading"
    >
      <div
        className={
          styles.heroShell +
          " relative overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-white shadow-[0_22px_70px_rgba(26,26,26,0.08)] sm:rounded-[1.65rem] md:rounded-[2rem]"
        }
      >
        <div className={styles.heroMobileVisual + " relative md:hidden"}>
          <Image
            src="/home/reference/home-hero-reference.webp"
            alt="A mother and child preparing vegetables together in a warm home kitchen."
            fill
            priority
            unoptimized
            sizes="calc(100vw - 32px)"
            className={styles.heroMobileArtwork}
          />
          <div className={styles.heroMobileWarmth + " absolute inset-0"} aria-hidden="true" />
          <div className={styles.heroMobileFade + " absolute inset-x-0 bottom-0"} aria-hidden="true" />
        </div>

        <Image
          src="/home/reference/home-hero-reference.webp"
          alt="A mother and child preparing vegetables together in a warm home kitchen."
          fill
          priority
          unoptimized
          sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), (min-width: 768px) calc(100vw - 56px)"
          className={styles.heroArtwork + " hidden object-cover md:block"}
        />
        <div className={styles.heroShade + " absolute inset-0 hidden md:block"} />
        <div
          className={styles.heroBottomFade + " absolute inset-x-0 bottom-0 hidden h-28 md:block"}
          aria-hidden="true"
        />

        <div
          className={
            styles.heroContent +
            " relative z-10 flex max-w-[43rem] flex-col justify-center px-5 pb-7 pt-3 sm:px-7 md:px-12 md:py-10 lg:px-16"
          }
        >
          <p className="mb-3 text-[0.64rem] font-black uppercase tracking-[0.13em] text-[#1A1A1A] md:mb-4 md:text-[0.68rem]">
            Welcome home, {firstName}
          </p>

          <h1
            id="discovery-heading"
            className={
              styles.heroTitle +
              " max-w-[38rem] font-display text-[clamp(1.95rem,8vw,3rem)] font-black leading-[1.01] tracking-[-0.048em] text-[#1A1A1A] md:text-[clamp(2.6rem,5vw,4.2rem)]"
            }
          >
            Eat for Health.
            <br />
            <span className="text-[#F62E18]">Taste the Comfort of Home.</span>
          </h1>

          <p className="mt-4 max-w-[34rem] text-sm font-medium leading-6 text-[#6B6B6B] md:mt-5 md:text-base md:leading-7">
            Fresh food from nearby home kitchens, made with familiar ingredients,
            personal recipes and the kind of care that feels like home.
          </p>

          <div className="mt-5 flex flex-wrap items-stretch gap-2.5 md:mt-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3.5 py-2 text-xs font-bold text-[#1A1A1A] shadow-[0_6px_18px_rgba(26,26,26,0.04)]">
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
