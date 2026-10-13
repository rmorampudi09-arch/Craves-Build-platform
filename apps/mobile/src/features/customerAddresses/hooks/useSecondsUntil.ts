import {useEffect, useState} from 'react';

/** Whole seconds left until `until` (epoch ms), ticking once a second; 0 when null or past. */
export function useSecondsUntil(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);

  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}
