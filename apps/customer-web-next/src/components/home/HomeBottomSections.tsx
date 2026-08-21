import { FaApple } from "react-icons/fa";

import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

function GooglePlayMark() {
  return (
    <svg
      viewBox="0 0 32 36"
      className="h-7 w-7 shrink-0"
      aria-hidden="true"
    >
      <path d="M2.6 2.7c-.5.7-.8 1.7-.8 2.9v24.8c0 1.2.3 2.2.8 2.9l14.3-15.3L2.6 2.7Z" fill="#00D3FF" />
      <path d="m17 18 4.7-5 6.1 3.5c1.8 1 1.8 2.1 0 3.1l-6.1 3.5L17 18Z" fill="#FFCE00" />
      <path d="M2.6 2.7 21.7 13 17 18 2.6 2.7Z" fill="#00F076" />
      <path d="M2.6 33.3 17 18l4.7 5.1L2.6 33.3Z" fill="#FF3A44" />
    </svg>
  );
}

export function HomeBottomSections() {
  return (
    <section
      id="craves-app"
      className={`${styles.fadeUp} border-t border-[#E5E7EB] bg-white`}
      aria-label="Craves app download options"
    >
      <div className="mx-auto flex max-w-[88rem] flex-wrap items-center justify-center gap-3 px-4 py-9 md:px-7 lg:px-10">
        <span className="inline-flex min-h-14 items-center gap-3 rounded-xl bg-[#1A1A1A] px-4 text-left text-white shadow-[0_8px_22px_rgba(26,26,26,0.14)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.02]">
          <GooglePlayMark />
          <span className="leading-tight">
            <small className="block text-[0.58rem] uppercase tracking-[0.08em] text-white/70">Get it on</small>
            <strong className="block text-base font-semibold text-white">Google Play</strong>
          </span>
        </span>
        <span className="inline-flex min-h-14 items-center gap-3 rounded-xl bg-[#1A1A1A] px-4 text-left text-white shadow-[0_8px_22px_rgba(26,26,26,0.14)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.02]">
          <FaApple className="h-8 w-8 shrink-0 text-white" aria-hidden="true" />
          <span className="leading-tight">
            <small className="block text-[0.58rem] text-white/70">Download on the</small>
            <strong className="block text-base font-semibold text-white">App Store</strong>
          </span>
        </span>
      </div>
    </section>
  );
}

export default HomeBottomSections;
