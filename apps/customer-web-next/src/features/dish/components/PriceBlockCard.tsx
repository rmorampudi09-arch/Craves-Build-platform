interface PriceBlockCardProps {
  price: number;
  originalPrice?: number;
}

export function PriceBlockCard({ price, originalPrice }: PriceBlockCardProps) {
  const discountPercent =
    originalPrice && originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : 0;

  return (
    <div className="shrink-0 rounded-2xl bg-[#F1F3F5] px-5 py-4 text-right">
      {discountPercent > 0 && (
        <span className="mb-1 inline-block rounded-full bg-[#F62E18] px-2.5 py-1 text-[10px] font-black text-white">
          {discountPercent}% OFF
        </span>
      )}
      <p className="font-display text-2xl font-black text-[#1A1A1A]">₹{price}</p>
      {originalPrice && originalPrice > price && (
        <p className="text-xs text-[#6B6B6B] line-through">₹{originalPrice}</p>
      )}
      <p className="text-[11px] font-semibold text-[#6B6B6B]">Per serve</p>
    </div>
  );
}

export default PriceBlockCard;
