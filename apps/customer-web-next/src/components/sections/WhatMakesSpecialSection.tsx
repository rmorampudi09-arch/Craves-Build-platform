import { Heart } from "lucide-react";
import { whyChooseFeatures } from "@/constants/landingContent";

/** "What Makes Craves Special?" — 6-item feature grid. */
export function WhatMakesSpecialSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="text-center">
        <h2 className="text-4xl font-bold text-ink md:text-5xl">What Makes Craves Special?</h2>
        <div className="my-4 flex items-center justify-center gap-2">
          <span className="h-px w-8 bg-primary" />
          <Heart className="h-4 w-4 fill-primary text-primary" />
          <span className="h-px w-8 bg-primary" />
        </div>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {whyChooseFeatures.map((f) => (
          <div key={f.title} className="feature-card">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/50 text-primary">
              <f.icon className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-ink">{f.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default WhatMakesSpecialSection;
