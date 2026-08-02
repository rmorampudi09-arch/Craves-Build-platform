import { ArrowRight } from "lucide-react";
import chefsCta from "@/assets/images/chefs-cta.jpg";
import { assetUrl } from "@/lib/asset-url";

export function BecomeChefCtaSection({
  onBecomeChef,
}: {
  onBecomeChef: () => void;
}) {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-20">
      <div
        className="relative overflow-hidden rounded-3xl"
        style={{ background: "var(--gradient-primary)" }}
      >
        <div className="grid items-center gap-6 p-8 md:grid-cols-[1fr_auto_1fr] md:p-12">
          <div className="flex items-center gap-6">
            <img
              src={assetUrl(chefsCta)}
              alt=""
              width={200}
              height={200}
              loading="lazy"
              className="hidden h-40 w-40 rounded-2xl object-cover object-left md:block"
            />
            <div>
              <h3 className="text-2xl font-bold text-white md:text-3xl">
                Are you a passionate cook?
              </h3>
              <p className="mt-2 text-white/90">
                Join Craves and turn your passion into pride.
              </p>
              <button
                type="button"
                onClick={onBecomeChef}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-primary transition-transform hover:-translate-y-0.5"
              >
                Become a Home Chef <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="hidden h-32 w-px bg-white/30 md:block" />
          <div className="flex items-center gap-6">
            <div>
              <h3 className="text-2xl font-bold text-white md:text-3xl">
                Earn. Share. Inspire.
              </h3>
              <p className="mt-2 text-white/90">
                Be your own boss and delight more hungry hearts!
              </p>
            </div>
            <img
              src={assetUrl(chefsCta)}
              alt=""
              width={200}
              height={200}
              loading="lazy"
              className="hidden h-40 w-40 rounded-2xl object-cover object-right md:block"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default BecomeChefCtaSection;
