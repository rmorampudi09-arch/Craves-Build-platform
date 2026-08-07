import { ChefHat, Heart, House, ShieldCheck, Truck } from "lucide-react";
import { CravesLogo } from "@/components/brand/CravesLogo";

const impactItems = [
  {
    title: "Support Home Chefs",
    description: "Every order helps home chefs share their passion.",
    icon: House,
  },
  {
    title: "Homemade Goodness",
    description: "Fresh ingredients, authentic recipes and real taste.",
    icon: ChefHat,
  },
  {
    title: "Safe & Hygienic",
    description: "Thoughtful preparation and carefully packed food.",
    icon: ShieldCheck,
  },
  {
    title: "Delivered with Care",
    description: "Homemade food brought to you with care.",
    icon: Truck,
  },
] as const;

/** Public landing footer inspired by the supplied Craves reference artwork. */
export function FooterSection() {
  return (
    <footer className="relative overflow-hidden border-t border-border bg-white text-black">
      <section className="relative isolate overflow-hidden bg-white py-16 md:py-20">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center opacity-45"
          style={{
            backgroundImage:
              "url('/landing/craves-footer-reference.jpg')",
          }}
        />
        <div className="absolute inset-0 bg-white/75" aria-hidden="true" />

        <div className="relative z-10 mx-auto max-w-7xl px-6">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,24rem)_1fr] lg:items-center">
            <div>
              <p className="font-script text-xl text-[#C92716]">Made with care</p>
              <h2 className="mt-2 font-display text-4xl font-bold tracking-[-0.04em] text-black md:text-5xl">
                Good food.
                <span className="block text-[#C92716]">Real impact.</span>
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-black/70">
                Every Craves order supports the people cooking from home and the communities enjoying their food.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {impactItems.map((item) => (
                <article
                  key={item.title}
                  className="rounded-2xl border border-grey-200 bg-white/90 p-5 text-center shadow-[var(--shadow-card)]"
                >
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F62E18]/10 text-[#C92716]">
                    <item.icon className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-black">{item.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-black/60">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#1A0D09] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-[1.2fr_2fr_1fr] md:py-14">
          <div>
            <div className="flex items-center gap-3">
              <CravesLogo size="lg" />
              <div>
                <p className="font-display text-xl font-bold text-white">Craves</p>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/65">
                  Food from home
                </p>
              </div>
            </div>
            <p className="mt-5 max-w-xs text-sm leading-6 text-white/70">
              Homemade meals from home chefs, discovered and ordered through Craves.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <p className="text-sm font-bold text-white">CRAVES</p>
              <div className="mt-4 grid gap-3 text-sm text-white/70">
                <a href="#why-craves" className="hover:text-white">Why Craves</a>
                <a href="#how-it-works" className="hover:text-white">How it works</a>
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-white">FOR CHEFS</p>
              <div className="mt-4 grid gap-3 text-sm text-white/70">
                <a href="#become-a-chef" className="hover:text-white">Become a chef</a>
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-white">TRUST</p>
              <div className="mt-4 grid gap-3 text-sm text-white/70">
                <span>Firebase-secured access</span>
                <span>Backend-backed menus</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-bold text-white">CRAVES APP</p>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Delicious food at your fingertips.
            </p>
            <div className="mt-5 grid gap-3">
              <div className="rounded-xl border border-white/20 px-4 py-3 text-sm text-white">
                Google Play
              </div>
              <div className="rounded-xl border border-white/20 px-4 py-3 text-sm text-white">
                App Store
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-5 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} Craves. All rights reserved.</span>
            <span className="inline-flex items-center gap-1.5">
              Made with <Heart className="h-3.5 w-3.5 fill-[#F62E18] text-[#F62E18]" aria-hidden="true" /> for food from home
            </span>
          </div>
        </div>
      </section>
    </footer>
  );
}

export default FooterSection;
