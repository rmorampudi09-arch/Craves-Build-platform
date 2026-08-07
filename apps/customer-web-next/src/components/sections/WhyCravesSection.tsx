import { ArrowRight, Heart } from "lucide-react";
import chefsCta from "@/assets/images/chefs-cta.jpg";
import { assetUrl } from "@/lib/asset-url";

const missionPoints = [
  "Empower home chefs",
  "Deliver authentic homemade food",
  "Ensure hygiene & quality",
  "Build a community of trust & love",
];

/** "Why Craves Exists?" — mission statement with a premium home-chef visual. */
export function WhyCravesSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <p className="font-script text-xl text-primary">Our Moto</p>
          <h2 className="mt-2 text-4xl font-bold text-ink md:text-5xl">Why Craves Exists?</h2>
          <div className="my-4 flex items-center gap-2">
            <span className="h-px w-8 bg-primary" />
            <Heart className="h-4 w-4 fill-primary text-primary" />
            <span className="h-px w-8 bg-primary" />
          </div>
          <p className="text-muted-foreground">
            At Craves, we believe that the best meals are made at{" "}
            <span className="font-semibold text-ink">home with love</span>.<br />
            Our moto is simple —<br />
            to <span className="font-semibold text-ink">connect home chefs with hungry hearts</span>
            .
          </p>
          <p className="mt-6 font-semibold text-ink">We are on a mission to:</p>
          <ul className="mt-3 space-y-2">
            {missionPoints.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-foreground">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
          <button className="btn-primary mt-8">
            Know More About Us <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-[#F62E18]/6" />
          <div className="overflow-hidden rounded-[2rem] border border-grey-200 bg-white shadow-[var(--shadow-card)]">
            <img
              src={assetUrl(chefsCta)}
              alt="Home chefs preparing homemade food"
              width={1600}
              height={640}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover object-center"
            />
          </div>
          <div className="absolute -bottom-5 -left-5 hidden rounded-2xl bg-white px-5 py-4 shadow-[var(--shadow-card)] sm:block">
            <p className="font-script text-lg text-[#C92716]">Food from home</p>
            <p className="mt-1 text-xs font-semibold text-black/65">Made with care. Shared with love.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default WhyCravesSection;
