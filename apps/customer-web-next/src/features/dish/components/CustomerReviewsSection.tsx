import { Star, User } from "lucide-react";

interface Review {
  name: string;
  rating: number;
  daysAgo: number;
  text: string;
}

export function CustomerReviewsSection({ reviews }: { reviews: Review[] }) {
  if (!reviews || reviews.length === 0) return null;

  return (
    <section className="mt-7">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-black text-[#1A1A1A]">Customer Reviews</h2>
        <button type="button" className="text-sm font-black text-[#F62E18]">
          See All
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {reviews.map((review) => (
          <div key={review.name} className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                <User className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-black text-[#1A1A1A]">{review.name}</p>
                <p className="flex items-center gap-1.5 text-xs text-[#6B6B6B]">
                  <span className="flex items-center gap-0.5">
                    {Array.from({ length: review.rating }).map((_, index) => (
                      <Star key={index} className="h-3 w-3 fill-[#F62E18] text-[#F62E18]" aria-hidden="true" />
                    ))}
                  </span>
                  {review.daysAgo === 0 ? "Today" : `${review.daysAgo} day${review.daysAgo > 1 ? "s" : ""} ago`}
                </p>
              </div>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{review.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default CustomerReviewsSection;
