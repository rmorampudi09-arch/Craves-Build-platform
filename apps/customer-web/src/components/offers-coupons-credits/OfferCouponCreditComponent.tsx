import React from 'react';
import { useOfferCouponCredit } from '../../hooks/useOfferCouponCredit';

export function OfferCouponCreditComponent() {
  const [code, setCode] = React.useState('WELCOME100');
  const { result, loading, validateOffer } = useOfferCouponCredit();

  return (
    <div className="min-h-screen bg-rose-50 p-6">
      <div className="mx-auto max-w-2xl rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-rose-950">Offers & coupons</h1>
        <p className="mt-2 text-rose-700">Launch-ready acquisition and win-back credits for Craves customers.</p>
        <div className="mt-6 flex gap-3">
          <input value={code} onChange={(event) => setCode(event.target.value)} className="flex-1 rounded-2xl border px-4 py-3" />
          <button onClick={() => validateOffer(code, 499)} className="rounded-2xl bg-rose-600 px-5 py-3 font-semibold text-white">
            {loading ? 'Checking...' : 'Apply'}
          </button>
        </div>
        {result && (
          <div className="mt-6 rounded-2xl bg-rose-50 p-4">
            <p className="font-semibold">{result.message}</p>
            <p>Discount: ₹{result.discountValue}</p>
            <p>Payable: ₹{result.payableAmount}</p>
          </div>
        )}
      </div>
    </div>
  );
}
