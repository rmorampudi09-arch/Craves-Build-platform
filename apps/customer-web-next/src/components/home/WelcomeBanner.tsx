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
  return (
    <section
      className={
        styles.fadeUp +
        " mx-auto max-w-[88rem] px-4 pt-4 md:px-5 md:pt-4 lg:px-10 lg:pt-5"
      }
      aria-label={`Welcome Taste Rebel home food banner for ${firstName}`}
      data-live-dish-count={dishCount}
    >
      <div className="overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-white shadow-[0_22px_70px_rgba(26,26,26,0.08)] sm:rounded-[1.65rem] md:rounded-[1.7rem] lg:rounded-[2rem]">
        <Image
          src="/home/reference/home-hero-banner.avif"
          alt="Welcome Taste Rebel. Eat for Health. Taste the Comfort of Home. Fresh food from nearby home kitchens, made with familiar ingredients, personal recipes and the kind of care that feels like home."
          width={1200}
          height={487}
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
