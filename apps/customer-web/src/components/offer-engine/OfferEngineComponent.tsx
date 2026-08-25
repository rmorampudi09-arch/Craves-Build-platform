import React, { useEffect, useState } from 'react';
import { useOfferEngine } from '../../hooks/useOfferEngine';

export const OfferEngineComponent: React.FC = () => {
  const { offers, selectedOffer, loading, error, loadOffers, applyOffer } = useOfferEngine();
  const [coupon, setCoupon] = useState('FIRSTCRAVE');

  useEffect(() => {
    loadOffers(501);
  }, [loadOffers]);

  return (
    <div className="min-h-screen bg-rose-50 p-6">
      <div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-lg">
        <h1 className="text-3xl font-bold text-slate-900">Best offers on your order</h1>
        <p className="mt-2 text-sm text-slate-600">Auto-apply the strongest promo or try a coupon code.</p>
        <div className="mt-6 flex gap-3">
          <input className="flex-1 rounded-xl border p-3" value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Enter coupon" />
          <button className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white" onClick={() => applyOffer(coupon)}>Apply</button>
        </div>
        {selectedOffer && (
          <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
            Applied <strong>{selectedOffer.code}</strong> — save ₹{selectedOffer.discountAmount}
          </div>
        )}
        {loading && <p className="mt-4 text-sm text-slate-500">Loading offers…</p>}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-8 grid gap-4">
          {offers.map((offer) => (
            <div key={offer.id} className="rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold">{offer.code}</p>
                  <p className="text-sm text-slate-600">{offer.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-emerald-700">₹{offer.discountAmount}</p>
                  <p className="text-xs text-slate-500">Min cart ₹{offer.minimumCartValue}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
