import React from 'react';

type Offer = { code: string; title: string; description: string; minOrderValue: number; discountAmount: number; tags: string[] };

type Props = {
  code: string;
  setCode: (value: string) => void;
  cartTotal: number;
  result: { eligible: boolean; discountApplied: number; finalTotal: number; reason: string } | null;
  offers: Offer[];
  apply: () => void;
};

export const OffersCouponsPromotionsComponent = ({ code, setCode, cartTotal, result, offers, apply }: Props) => (
  <section className="space-y-6">
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-amber-100">
      <div className="flex flex-col gap-3 md:flex-row">
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Enter coupon code" className="flex-1 rounded-2xl border border-slate-200 px-4 py-3" />
        <button onClick={apply} className="rounded-2xl bg-amber-500 px-6 py-3 font-semibold text-white">Apply coupon</button>
      </div>
      <p className="mt-3 text-sm text-slate-500">Cart total: ₹{cartTotal}</p>
      {result ? (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-slate-700">
          <p className="font-semibold">{result.eligible ? 'Offer applied' : 'Offer not eligible'}</p>
          <p>{result.reason}</p>
          <p className="mt-1">Discount: ₹{result.discountApplied} · Final total: ₹{result.finalTotal}</p>
        </div>
      ) : null}
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      {offers.map((offer) => (
        <article key={offer.code} className="rounded-3xl border border-amber-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">{offer.code}</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">{offer.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{offer.description}</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">₹{offer.discountAmount}</span>
          </div>
        </article>
      ))}
    </div>
  </section>
);
