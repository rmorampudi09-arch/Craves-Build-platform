import React, { useState } from 'react';
import { OfferEngineCouponWalletComponent } from '../../components/offer-engine-coupon-wallet/OfferEngineCouponWalletComponent';
import { useOfferEngineCouponWallet } from '../../hooks/useOfferEngineCouponWallet';

const OfferEnginePage = () => {
  const [couponCode, setCouponCode] = useState('HYD50');
  const hook = useOfferEngineCouponWallet(couponCode);

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-3xl font-bold text-stone-900">Offers & Coupon Wallet</h1>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <input className="w-full rounded-xl border p-3" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Enter coupon code" />
        </div>
        <OfferEngineCouponWalletComponent {...hook} couponCode={couponCode} />
      </div>
    </div>
  );
};

export default OfferEnginePage;
