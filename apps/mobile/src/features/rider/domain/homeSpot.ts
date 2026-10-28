/**
 * Phase 5: the home spot heading home leads to, kept to 2 decimal places (about 1.1 km by 1.06 km in Hyderabad), so the
 * phone's exact position never leaves it; the server rounds again and keeps no more.
 */
export function roundToSpot(here: {lat: number; lng: number}): {lat: number; lng: number} {
  const round = (degrees: number) => Math.round(degrees * 100) / 100;
  return {lat: round(here.lat), lng: round(here.lng)};
}

/** 3240 metres nearer home reads "3.2". */
export function nearerKm(metres: number): string {
  return (Math.round(metres / 100) / 10).toFixed(1);
}
