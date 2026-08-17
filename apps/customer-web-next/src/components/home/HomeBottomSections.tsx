import { Clock3, Heart, MapPin, ShieldCheck } from "lucide-react";
import { FaApple, FaGooglePlay } from "react-icons/fa";

import { ReferenceImageCrop } from "@/components/sections/landing-reference/ReferenceImageCrop";

const trustItems = [
  {
    icon: Heart,
    title: "Homemade & Healthy",
    body: "Made with love for your health",
  },
  {
    icon: MapPin,
    title: "Local & Reliable",
    body: "Home kitchens close to you",
  },
  {
    icon: Clock3,
    title: "Freshly Made",
    body: "Prepared fresh after you order",
  },
  {
    icon: ShieldCheck,
    title: "Safe & Hygienic",
    body: "Cooking you can trust",
  },
] as const;

export function HomeBottomSections() {
  return (
    <>
      <section className="mx-auto max-w-7xl px-4 pb-10 pt-2 md:px-6">
        <div className="grid overflow-hidden rounded-2xl border border-[#EFE7E3] bg-[#FFF9F6] sm:grid-cols-2 lg:grid-cols-4">
          {trustItems.map(({ icon: Icon, title, body }, index) => (
            <article
              key={title}
              className={`flex gap-3 px-5 py-5 ${index > 0 ? "lg:border-l lg:border-[#EEDDD6]" : ""}`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18] shadow-sm">
                <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-ink">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="craves-app" className="border-y border-[#ECEDEF] bg-[#F7F8FA]">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 md:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-14">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#F62E18]">
              Craves app
            </p>
            <h2 className="mt-3 max-w-xl font-display text-3xl font-bold tracking-[-0.04em] text-ink md:text-4xl">
              Homemade food, in your pocket.
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground md:text-base">
              Discover, order and enjoy homemade meals from trusted home chefs near you.
            </p>

            <div className="mt-6 flex flex-wrap gap-3" aria-label="Craves app download options">
              <span className="inline-flex min-h-14 items-center gap-3 rounded-xl bg-black px-4 text-white">
                <FaGooglePlay className="h-6 w-6" aria-hidden="true" />
                <span className="leading-tight">
                  <small className="block text-[0.62rem] uppercase tracking-[0.08em] text-white/75">Get it on</small>
                  <strong className="block text-base font-semibold">Google Play</strong>
                </span>
              </span>
              <span className="inline-flex min-h-14 items-center gap-3 rounded-xl bg-black px-4 text-white">
                <FaApple className="h-7 w-7" aria-hidden="true" />
                <span className="leading-tight">
                  <small className="block text-[0.62rem] text-white/75">Download on the</small>
                  <strong className="block text-base font-semibold">App Store</strong>
                </span>
              </span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl bg-white shadow-[0_18px_50px_rgba(17,17,17,0.08)]">
            <ReferenceImageCrop
              src="/landing/reference/home-chefs-app-reference.png"
              sourceWidth={2048}
              sourceHeight={1372}
              crop={{ x: 880, y: 855, width: 1010, height: 510 }}
              alt="Craves mobile app screens for discovering homemade meals and nearby home chefs."
              sizes="(min-width: 1024px) 52vw, 100vw"
              className="min-h-[16rem] w-full"
            />
          </div>
        </div>
      </section>
    </>
  );
}

export default HomeBottomSections;
