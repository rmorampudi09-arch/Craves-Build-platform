import React from 'react';
import { RatingsAndReviewsComponent } from '../../components/ratings-and-reviews/RatingsAndReviewsComponent';
import { useRatingsAndReviews } from '../../hooks/useRatingsAndReviews';

const RatingsAndReviewsPage = () => {
  const reviews = useRatingsAndReviews();

  return (
    <main className="min-h-screen bg-rose-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-600">Trust signals</p>
          <h1 className="text-3xl font-bold text-slate-900">Ratings and reviews</h1>
          <p className="mt-2 text-slate-600">Verified-order review summaries for chefs, kitchens and dishes.</p>
        </header>
        <RatingsAndReviewsComponent {...reviews} />
      </div>
    </main>
  );
};

export default RatingsAndReviewsPage;
