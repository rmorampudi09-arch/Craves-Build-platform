import Image from "next/image";

import styles from "@/features/home/screens/HomeReference.module.css";

interface WelcomeBannerProps {
  dishCount: number;
  radiusLabel: string | null;
  defaultAddressLabel: string;
  hasDefaultAddress: boolean;
  onManageDefaultAddress: () => void;
}

/** The approved static banner artwork, shown as it is. */
export function WelcomeBanner({ dishCount }: WelcomeBannerProps) {
  return (
    <section
      className={
        styles.fadeUp +
        " mx-auto max-w-[88rem] px-4 pt-3 md:px-5 md:pt-3 lg:px-10 lg:pt-4"
      }
      data-live-dish-count={dishCount}
    >
      <div className="relative overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-[#F1F3F5] shadow-[0_18px_54px_rgba(26,26,26,0.075)] sm:rounded-[1.65rem] md:rounded-[1.7rem] lg:rounded-[2rem]">
        <Image
          src="/home/cravings/craves-home-banner.webp"
          alt="Welcome taste rebel. Eat for Health. Taste the Comfort of Home. Fresh food from nearby home kitchens, made with familiar ingredients. A home chef cooks with her child nearby in a warm family kitchen."
          width={1983}
          height={793}
          priority
          unoptimized
          sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), (min-width: 768px) calc(100vw - 40px), calc(100vw - 32px)"
          className="block h-auto w-full"
        />
      </div>
    </section>
  );
}

export default WelcomeBanner;
