import { useEffect, useState } from 'react';

export function useLoyaltyCoinReferral(customerId: string) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/rewards?customerId=${customerId}`)
      .then((response) => response.json())
      .then(setData);
  }, [customerId]);

  return data;
}
