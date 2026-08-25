import { useEffect, useState } from 'react';

type WalletOffer = { id: string; couponCode: string; title: string; walletLabel: string; eligible: boolean; discountAmount: number; finalPayable: number; };

export const useOfferEngineCouponWallet = (couponCode: string) => {
  const [offers, setOffers] = useState<WalletOffer[]>([]);
  const [applied, setApplied] = useState<WalletOffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/wallet', { headers: { 'X-User-Id': 'customer-demo-001' } })
      .then((res) => res.json())
      .then(setOffers)
      .catch(() => setError('Unable to load wallet offers'));
  }, []);

  const applyOffer = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/offers/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'customer-demo-001' },
        body: JSON.stringify({ cartId: 'cart-demo-001', couponCode, cartValue: 499 })
      });
      if (!response.ok) throw new Error('Coupon apply failed');
      setApplied(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return { offers, applied, loading, error, applyOffer };
};
