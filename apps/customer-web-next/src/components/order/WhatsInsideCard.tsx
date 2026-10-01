/** Ingredient pill list for the public customer dish page. */
export function WhatsInsideCard({ ingredients }: { ingredients: string[] }) {
  if (!ingredients || ingredients.length === 0) return null;
  const visible = ingredients.slice(0, 4);
  const remaining = ingredients.length - visible.length;

  return (
    <section className="mt-7">
      <h2 className="font-display text-lg font-black text-[#1A1A1A]">Ingredients</h2>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {visible.map((ingredient) => (
          <span
            key={ingredient}
            className="rounded-full border border-[#E5E7EB] bg-[#F1F3F5] px-3 py-1.5 text-xs font-bold text-[#1A1A1A]"
          >
            {ingredient}
          </span>
        ))}
        {remaining > 0 && (
          <span className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-bold text-[#6B6B6B]">
            +{remaining}
          </span>
        )}
      </div>
    </section>
  );
}

export default WhatsInsideCard;
