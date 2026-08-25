import { useEffect, useState } from 'react';

type Entry = { id: string; activityType: string; referenceCode: string; coinsDelta: number; balanceAfter: number; createdAt: string; };

export const useReferralCravesCoinsLoyalty = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch('/api/v1/loyalty/wallet', { headers: { 'X-User-Id': 'customer-demo-001' } });
    if (!response.ok) throw new Error('Unable to load loyalty wallet');
    setEntries(await response.json());
  };

  useEffect(() => { load().catch(() => setError('Unable to load loyalty wallet')); }, []);

  const redeem = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/loyalty/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'customer-demo-001' },
        body: JSON.stringify({ activityType: 'REDEMPTION', referenceCode: 'ORDER-SAVE-25', coins: 25 })
      });
      if (!response.ok) throw new Error('Unable to redeem coins');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return { entries, loading, error, redeem };
};
