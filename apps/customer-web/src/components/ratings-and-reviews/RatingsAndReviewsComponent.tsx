import React from 'react';

type Review = { reviewId: string; customerName: string; rating: number; comment: string; verifiedOrder: boolean; createdAt: string };

type Props = {
  averageRating: number;
  totalReviews: number;
  reviews: Review[];
};

export const RatingsAndReviewsComponent = ({ averageRating, totalReviews, reviews }: Props) => (
  <section className="space-y-6">
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-rose-100">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-600">Chef rating</p>
      <div className="mt-3 flex items-end gap-3">
        <h2 className="text-5xl font-bold text-slate-900">{averageRating.toFixed(1)}</h2>
        <p className="pb-2 text-slate-500">from {totalReviews} verified reviews</p>
      </div>
    </div>
    <div className="grid gap-4">
      {reviews.map((review) => (
        <article key={review.reviewId} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">{review.customerName}</h3>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-600">{review.rating}/5</span>
          </div>
          <p className="mt-3 text-slate-600">{review.comment}</p>
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
            {review.verifiedOrder ? <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-600">Verified order</span> : null}
            <span>{new Date(review.createdAt).toLocaleDateString()}</span>
          </div>
        </article>
      ))}
    </div>
  </section>
);
