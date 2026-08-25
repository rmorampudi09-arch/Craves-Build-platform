import { useState } from 'react';

export function useOfferCouponCredit() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function validateOffer(code: string, cartValue: number) {
    setLoading(true);
    const response = await fetch('/api/offers/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, cartValue, firstOrderCustomer: true })
    });
    const payload = await response.json();
    setResult(payload);
    setLoading(false);
  }

  return { result, loading, validateOffer };
}
