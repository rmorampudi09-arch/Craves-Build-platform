import { ArrowRight, Heart } from "lucide-react";
import chefIllustration from "@/assets/images/chef-illustration.jpg";
import { assetUrl } from "@/lib/asset-url";

const missionPoints = [
  "Empower home chefs",
  "Deliver authentic homemade food",
  "Ensure hygiene & quality",
  "Build a community of trust & love",
];

/** "Why Craves Exists?" — mission statement with a chef illustration. */
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
          <div className="absolute inset-0 -z-10 rounded-[40%_40%_20%_20%] bg-accent/50" />
          <img
            src={assetUrl(chefIllustration)}
            alt="Home chef cooking"
            width={1024}
            height={1024}
            loading="lazy"
            className="mx-auto w-full max-w-md"
          />
        </div>
      </div>
    </section>
  );
}

export default WhyCravesSection;
