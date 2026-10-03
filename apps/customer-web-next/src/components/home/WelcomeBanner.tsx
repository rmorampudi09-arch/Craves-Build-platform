import Image from "next/image";

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
  const greetingName = firstName.trim() || "there";

  return (
    <section
      className={
        styles.fadeUp +
        " mx-auto max-w-[88rem] px-4 pt-3 md:px-5 md:pt-3 lg:px-10 lg:pt-4"
      }
      aria-label={`Hello ${greetingName} home food banner`}
      data-live-dish-count={dishCount}
    >
      <div className="relative overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-[#FFF8EF] shadow-[0_18px_54px_rgba(26,26,26,0.075)] sm:rounded-[1.65rem] md:rounded-[1.7rem] lg:rounded-[2rem]">
        <Image
          src="/home/cravings/craves-home-banner.webp"
          alt={`Hello ${greetingName}. Eat for Health. Taste the Comfort of Home. A home chef cooks with her child nearby in a warm family kitchen.`}
          width={1983}
          height={793}
          priority
          unoptimized
          sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), (min-width: 768px) calc(100vw - 40px), calc(100vw - 32px)"
          className="block h-auto w-full"
        />
        <div
          className="absolute left-[4.95%] top-[13.8%] min-w-[17rem] bg-[#fdfcfb] pb-[0.35%] pr-[1.2%] pt-[0.2%] sm:min-w-[19rem] md:min-w-[21rem]"
          aria-hidden="true"
        >
          <p className="truncate text-[0.52rem] font-black uppercase leading-none tracking-[0.32em] text-[#111111] sm:text-[0.68rem] md:text-[0.8rem] lg:text-[0.92rem] xl:text-[1.04rem]">
            Hello {greetingName}
          </p>
        </div>
      </div>
    </section>
  );
}

export default WelcomeBanner;
