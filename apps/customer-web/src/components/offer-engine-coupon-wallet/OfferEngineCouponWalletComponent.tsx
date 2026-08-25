import React from 'react';

type WalletOffer = { id: string; couponCode: string; title: string; walletLabel: string; eligible: boolean; discountAmount: number; finalPayable: number; };

type Props = { couponCode: string; offers: WalletOffer[]; applied: WalletOffer | null; loading: boolean; error: string | null; applyOffer: () => Promise<void>; };

export const OfferEngineCouponWalletComponent = ({ offers, applied, loading, error, applyOffer }: Props) => (
  <div className="space-y-4">
    {error && <div className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
    {applied && <div className="rounded-xl bg-emerald-50 p-4 text-emerald-700">Applied {applied.couponCode}: saved ₹{applied.discountAmount}. Final payable ₹{applied.finalPayable}</div>}
    <button onClick={applyOffer} disabled={loading} className="rounded-xl bg-stone-900 px-4 py-3 text-white disabled:bg-stone-300">{loading ? 'Applying…' : 'Apply coupon'}</button>
    <div className="grid gap-4 md:grid-cols-2">
      {offers.map((offer) => (
        <div key={offer.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <h3 className="font-semibold text-stone-900">{offer.title}</h3>
          <p className="mt-1 text-sm text-stone-500">{offer.walletLabel}</p>
          <span className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{offer.couponCode}</span>
        </div>
      ))}
    </div>
  </div>
);
