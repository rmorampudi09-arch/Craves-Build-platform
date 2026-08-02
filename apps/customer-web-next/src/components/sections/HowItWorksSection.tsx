import { ArrowRight, Heart } from "lucide-react";
import { howItWorksSteps } from "@/constants/landingContent";

/** "How Craves Works" — the 4-step choose/order/cook/deliver flow. */
export function HowItWorksSection() {
  return (
    <section className="bg-cream-deep py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-ink md:text-5xl">How Craves Works</h2>
          <div className="my-4 flex items-center justify-center gap-2">
            <span className="h-px w-8 bg-primary" />
            <Heart className="h-4 w-4 fill-primary text-primary" />
            <span className="h-px w-8 bg-primary" />
          </div>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-4">
          {howItWorksSteps.map((s, i) => (
            <div key={s.title} className="relative text-center">
              <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full bg-accent/40">
                <img
                  src={s.img}
                  alt={s.title}
                  width={512}
                  height={512}
                  loading="lazy"
                  className="h-36 w-36 rounded-full object-cover"
                />
              </div>
              <h3 className="mt-5 text-lg font-bold text-primary">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              {i < howItWorksSteps.length - 1 && (
                <ArrowRight className="absolute right-[-18px] top-16 hidden h-8 w-8 text-primary md:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowItWorksSection;
