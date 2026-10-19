const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "₹1,23,456" with Indian grouping; paise shown only when non-zero ("₹12.50"). */
export function formatRupees(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.round(paise));
  const rupees = String(Math.floor(abs / 100));
  const rest = abs % 100;
  const grouped =
    rupees.length > 3
      ? `${rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${rupees.slice(-3)}`
      : rupees;
  return `${sign}₹${grouped}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

export function formatKm(meters: number): string {
  // Round in whole 100 m steps first: toFixed alone turns 0.35 into "0.3".
  return `${(Math.round(Math.max(0, meters) / 100) / 10).toFixed(1)} km`;
}

/** 12-hour clock with am/pm, in the phone's time zone. */
export function formatClock(value: string | number): string {
  const date = new Date(value);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
}

export function formatDay(value: string | number): string {
  const date = new Date(value);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "4:05" for countdowns and shift timers; hours appear only when needed ("1:02:09"). */
export function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = String(s % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** Negative when a < b, for dotted versions like "1.2.0". */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) {
      return diff;
    }
  }
  return 0;
}

/** Straight-line metres between two points (haversine); good enough for "near the drop" hints. */
export function distanceMeters(
  a: {lat: number; lng: number},
  b: {lat: number; lng: number},
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
