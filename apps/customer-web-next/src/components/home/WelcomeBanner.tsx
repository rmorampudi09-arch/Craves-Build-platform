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
        " mx-auto max-w-[88rem] px-4 pt-3 md:px-5 md:pt-3 lg:px-10 lg:pt-4"
      }
      aria-label={`Welcome Taste Rebel home food banner for ${firstName}`}
      data-live-dish-count={dishCount}
    >
      <div className="relative overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-[#FFF8EF] shadow-[0_18px_54px_rgba(26,26,26,0.075)] sm:rounded-[1.65rem] md:rounded-[1.7rem] lg:rounded-[2rem]">
        <Image
          src="/home/cravings/craves-home-banner.webp"
          alt="A home chef cooking with her child nearby in a warm family kitchen."
          width={1983}
          height={793}
          priority
          unoptimized
          sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), (min-width: 768px) calc(100vw - 40px), calc(100vw - 32px)"
          className="block h-auto w-full"
        />

        <div className="absolute inset-y-0 left-0 flex w-[47%] flex-col justify-center px-[4.2%] py-[5%] text-left sm:w-[45%] md:w-[46%]">
          <p className="text-[0.42rem] font-black uppercase tracking-[0.22em] text-[#111111] sm:text-[0.56rem] md:text-[0.68rem] lg:text-[0.78rem] xl:text-[0.86rem]">
            Welcome Taste Rebel
          </p>
          <h2 className="mt-[2.2%] font-sans text-[clamp(1.05rem,4.05vw,4.55rem)] font-black leading-[0.92] tracking-[-0.065em] text-black">
            Eat for Health.
          </h2>
          <p className="mt-[1.4%] font-sans text-[clamp(1rem,3.85vw,4.35rem)] font-black leading-[0.9] tracking-[-0.062em] text-[#F21313]">
            <span className="block">Taste the</span>
            <span className="block">Comfort of</span>
            <span className="block">Home.</span>
          </p>
          <p className="mt-[3%] hidden max-w-[92%] text-[clamp(0.65rem,1.18vw,1.08rem)] font-medium leading-[1.45] text-[#5F6672] sm:block">
            Fresh food from nearby home kitchens, made with familiar ingredients,
            personal recipes and the kind of care that feels like home.
          </p>
        </div>
      </div>
    </section>
  );
}

export default WelcomeBanner;
