import type { Chef } from "@/services/api/chefs";

/** "About" bio paragraph plus a row of specialty/cuisine pills. */
export function ChefAboutSection({ chef }: { chef: Chef }) {
  return (
    <section className="mt-6">
      <h2 className="font-display text-lg font-bold text-ink">About</h2>
      <p className="mt-1.5 text-sm text-ink/80">{chef.bio}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {chef.specialties.map((s) => (
          <span
            key={s}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink"
          >
            {s}
          </span>
        ))}
      </div>
    </section>
  );
}

export default ChefAboutSection;
