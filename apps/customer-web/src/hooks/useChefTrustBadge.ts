import { useEffect, useState } from 'react';

export function useChefTrustBadge(chefId: string) {
  const [badges, setBadges] = useState<{ code: string; label: string; description: string }[]>([]);

  useEffect(() => {
    fetch(`/api/chefs/${chefId}/trust`)
      .then((response) => response.json())
      .then((payload) => setBadges(payload.badges ?? []));
  }, [chefId]);

  return badges;
}
