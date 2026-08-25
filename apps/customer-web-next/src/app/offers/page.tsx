"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Offer } from "@/lib/offer-engine-contract";

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [code, setCode] = useState("");
  const [validated, setValidated] = useState<Offer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/offers/applicable", { cache: "no-store", credentials: "same-origin" });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(response.status === 401 ? "Please sign in to view offers for your cart." : "Offers are temporarily unavailable.");
        setOffers(body as Offer[]);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Offers are temporarily unavailable.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function validate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setValidated(null);
    const normalized = code.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/.test(normalized)) {
      setError("Enter a valid offer code.");
      return;
    }
    try {
      const response = await fetch("/api/offers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ code: normalized }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 409 ? "This offer is not applicable to your current cart." : "Offer validation is temporarily unavailable.");
      setValidated(body as Offer);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Offer validation is temporarily unavailable.");
    }
  }

  return (
    <main className="min-h-screen bg-[#0B1426] px-4 py-8 text-[#0B1426] sm:px-6">
      <section className="mx-auto max-w-4xl rounded-3xl bg-[#FFF8EC] p-6 shadow-xl sm:p-8">
        <h1 className="text-3xl font-bold">Offers for your cart</h1>
        <p className="mt-2 text-sm text-slate-600">Discount values are calculated by Craves from the current server-side cart.</p>
        <form onSubmit={validate} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input value={code} onChange={(event) => setCode(event.target.value)} maxLength={40} placeholder="Enter offer code" className="flex-1 rounded-xl border border-slate-300 bg-white p-3" />
          <button className="rounded-xl bg-[#F6B545] px-5 py-3 font-semibold">Check code</button>
        </form>
        {error ? <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div> : null}
        {validated ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><strong>{validated.code}</strong> saves {validated.currency} {validated.discountAmount.toFixed(2)} on the current food subtotal.</div> : null}
        <div className="mt-8 space-y-4">
          {loading ? <p className="text-sm text-slate-600">Checking current offers…</p> : null}
          {!loading && offers.length === 0 ? <p className="text-sm text-slate-600">There are no configured offers applicable to the current cart.</p> : null}
          {offers.map((offer) => <article key={offer.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex justify-between gap-4"><div><h2 className="font-semibold">{offer.title}</h2><p className="mt-1 text-sm text-slate-600">{offer.description || offer.code}</p></div><div className="text-right font-semibold">Save {offer.currency} {offer.discountAmount.toFixed(2)}</div></div></article>)}
        </div>
      </section>
    </main>
  );
}
