import type { Chef } from "@/services/api/chefs";

export function ChefAboutSection({ chef }: { chef: Chef }) {
  if (!chef.bio && chef.specialties.length === 0) return null;

  return (
    <section className="mt-6 rounded-[1.75rem] border border-[#E5E7EB] bg-white p-5 md:p-6">
      <h2 className="font-display text-lg font-black text-[#1A1A1A]">
        {chef.bio ? "About this kitchen" : "Menu categories"}
      </h2>
      {chef.bio ? (
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{chef.bio}</p>
      ) : null}
      {chef.specialties.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Available menu categories">
          {chef.specialties.map((specialty) => (
            <span
              key={specialty}
              className="rounded-full bg-[#F1F3F5] px-3 py-1.5 text-xs font-bold text-[#1A1A1A]"
            >
              {specialty}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default ChefAboutSection;
