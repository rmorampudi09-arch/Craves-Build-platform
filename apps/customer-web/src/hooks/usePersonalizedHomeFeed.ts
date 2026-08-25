import { useEffect, useState } from 'react';

export function usePersonalizedHomeFeed(customerId: string) {
  const [data, setData] = useState<{ rails: { title: string; items: string[] }[] }>({ rails: [] });

  useEffect(() => {
    fetch(`/api/discovery/personalized?customerId=${customerId}`)
      .then((response) => response.json())
      .then(setData);
  }, [customerId]);

  return data;
}
