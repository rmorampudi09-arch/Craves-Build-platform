import { Clock3, Heart, MapPin, ShieldCheck } from "lucide-react";
import { FaApple, FaGooglePlay } from "react-icons/fa";

import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

const trustItems = [
  {
    icon: Heart,
    title: "Homemade & Healthy",
    body: "Food with the comfort and care of home.",
  },
  {
    icon: MapPin,
    title: "Local & Reliable",
    body: "Discover home kitchens close to you.",
  },
  {
    icon: Clock3,
    title: "Freshly Made",
    body: "Prepared fresh instead of sitting on a shelf.",
  },
  {
    icon: ShieldCheck,
    title: "Safe & Hygienic",
    body: "A cleaner, more personal way to eat nearby.",
  },
] as const;

export function HomeBottomSections() {
  return (
    <>
      <section className={`${styles.fadeUp} mx-auto max-w-[88rem] px-4 pb-12 pt-3 md:px-7 lg:px-10 lg:pb-16`}>
        <div className="overflow-hidden rounded-[2.25rem] bg-[#261A15] px-6 py-8 text-white shadow-[0_22px_60px_rgba(38,26,21,0.16)] md:px-9 md:py-10 lg:px-11">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/12 pb-7">
            <div>
              <p className="text-[0.66rem] font-black uppercase tracking-[0.18em] text-[#FF9B8F]">Why it feels different</p>
              <h2 className="mt-1.5 font-display text-3xl font-black tracking-[-0.045em] md:text-4xl">
                Food closer to the way home makes it.
              </h2>
            </div>
            <Heart className="hidden h-10 w-10 fill-[#F62E18] text-[#F62E18] md:block" aria-hidden="true" />
          </div>

          <div className="grid gap-6 pt-7 sm:grid-cols-2 lg:grid-cols-4">
            {trustItems.map(({ icon: Icon, title, body }) => (
              <article key={title} className="group flex gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/9 text-[#FF7868] transition duration-300 group-hover:-translate-y-1 group-hover:bg-white/14">
                  <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-white">{title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-white/64">{body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="craves-app" className="border-t border-[#EADCD2] bg-[#FFF8F1]">
        <div className="mx-auto flex max-w-[88rem] flex-col items-center justify-between gap-5 px-4 py-8 text-center md:flex-row md:px-7 md:py-9 md:text-left lg:px-10">
          <div>
            <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">Take Craves with you</p>
            <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.04em] text-[#261A15] md:text-3xl">
              Homemade food, in your pocket.
            </h2>
          </div>

          <div className="flex flex-wrap justify-center gap-3" aria-label="Craves app download options">
            <span className="inline-flex min-h-14 items-center gap-3 rounded-xl bg-black px-4 text-left text-white shadow-[0_8px_22px_rgba(0,0,0,0.14)]">
              <FaGooglePlay className="h-6 w-6" aria-hidden="true" />
              <span className="leading-tight">
                <small className="block text-[0.58rem] uppercase tracking-[0.08em] text-white/70">Get it on</small>
                <strong className="block text-base font-semibold">Google Play</strong>
              </span>
            </span>
            <span className="inline-flex min-h-14 items-center gap-3 rounded-xl bg-black px-4 text-left text-white shadow-[0_8px_22px_rgba(0,0,0,0.14)]">
              <FaApple className="h-7 w-7" aria-hidden="true" />
              <span className="leading-tight">
                <small className="block text-[0.58rem] text-white/70">Download on the</small>
                <strong className="block text-base font-semibold">App Store</strong>
              </span>
            </span>
          </div>
        </div>
      </section>
    </>
  );
}

export default HomeBottomSections;
