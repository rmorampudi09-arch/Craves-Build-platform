import { FaApple, FaGooglePlay } from "react-icons/fa";

import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

export function HomeBottomSections() {
  return (
    <section
      id="craves-app"
      className={`${styles.fadeUp} border-t border-[#E5E7EB] bg-white`}
      aria-label="Craves app download options"
    >
      <div className="mx-auto flex max-w-[88rem] flex-wrap items-center justify-center gap-3 px-4 py-9 md:px-7 lg:px-10">
        <span className="inline-flex min-h-14 items-center gap-3 rounded-xl bg-[#1A1A1A] px-4 text-left text-white shadow-[0_8px_22px_rgba(26,26,26,0.14)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.02]">
          <FaGooglePlay className="h-6 w-6" aria-hidden="true" />
          <span className="leading-tight">
            <small className="block text-[0.58rem] uppercase tracking-[0.08em] text-white/70">Get it on</small>
            <strong className="block text-base font-semibold">Google Play</strong>
          </span>
        </span>
        <span className="inline-flex min-h-14 items-center gap-3 rounded-xl bg-[#1A1A1A] px-4 text-left text-white shadow-[0_8px_22px_rgba(26,26,26,0.14)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.02]">
          <FaApple className="h-7 w-7" aria-hidden="true" />
          <span className="leading-tight">
            <small className="block text-[0.58rem] text-white/70">Download on the</small>
            <strong className="block text-base font-semibold">App Store</strong>
          </span>
        </span>
      </div>
    </section>
  );
}

export default HomeBottomSections;
