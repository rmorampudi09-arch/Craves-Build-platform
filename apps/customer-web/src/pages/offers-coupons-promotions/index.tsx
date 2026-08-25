import React from 'react';
import { OffersCouponsPromotionsComponent } from '../../components/offers-coupons-promotions/OffersCouponsPromotionsComponent';
import { useOffersCouponsPromotions } from '../../hooks/useOffersCouponsPromotions';

const OffersCouponsPromotionsPage = () => {
  const promotions = useOffersCouponsPromotions();

  return (
    <main className="min-h-screen bg-amber-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-600">Promotions</p>
          <h1 className="text-3xl font-bold text-slate-900">Apply offers and intro coupons at checkout</h1>
          <p className="mt-2 text-slate-600">Launch-ready coupon handling for first-order discounts, chef-funded offers and free-delivery promos.</p>
        </header>
        <OffersCouponsPromotionsComponent {...promotions} />
      </div>
    </main>
  );
};

export default OffersCouponsPromotionsPage;
