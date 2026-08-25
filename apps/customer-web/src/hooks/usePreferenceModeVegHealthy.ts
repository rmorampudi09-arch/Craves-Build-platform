import { useEffect, useState } from 'react';

type Preference = { discoveryMode: string; vegOnly: boolean; healthyOnly: boolean; spiceTolerance: string; };

export const usePreferenceModeVegHealthy = () => {
  const [preference, setPreference] = useState<Preference>({ discoveryMode: 'all', vegOnly: false, healthyOnly: false, spiceTolerance: 'medium' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/users/me/preferences', { headers: { 'X-User-Id': 'customer-demo-001' } })
      .then((res) => res.json())
      .then(setPreference)
      .catch(() => setError('Unable to load preferences'));
  }, []);

  const update = async (patch: Partial<Preference>) => {
    const next = { ...preference, ...patch };
    setPreference(next);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/users/me/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'customer-demo-001' },
        body: JSON.stringify(next)
      });
      if (!response.ok) throw new Error('Unable to update preferences');
      setPreference(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return { preference, loading, error, update };
};
