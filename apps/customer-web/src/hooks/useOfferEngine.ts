import { useCallback, useState } from 'react';

type Offer = {
  id: number;
  code: string;
  description: string;
  discountAmount: number;
  minimumCartValue: number;
  autoApply: boolean;
  active: boolean;
};

export const useOfferEngine = () => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOffers = useCallback(async (cartId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/offers/applicable?cartId=${cartId}`, { headers: { 'X-Customer-Id': '42' } });
      if (!response.ok) throw new Error('Unable to load offers');
      setOffers(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setOffers([
        { id: 1, code: 'FIRSTCRAVE', description: '₹125 off on your first home-chef order', discountAmount: 125, minimumCartValue: 299, autoApply: true, active: true },
        { id: 2, code: 'FREESHIP', description: 'Waive delivery fee over ₹399', discountAmount: 49, minimumCartValue: 399, autoApply: false, active: true }
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  const applyOffer = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/offers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Customer-Id': '42' },
        body: JSON.stringify({ code, description: 'Manual apply', discountAmount: 125, minimumCartValue: 299, cartValue: 450, autoApply: false })
      });
      if (!response.ok) throw new Error('Coupon validation failed');
      setSelectedOffer(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  return { offers, selectedOffer, loading, error, loadOffers, applyOffer };
};
