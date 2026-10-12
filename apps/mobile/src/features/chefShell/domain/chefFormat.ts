const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `#` + last 5 characters of the id without dashes, uppercase. The one order number every chef screen shows. */
export function shortOrderNumber(id: string): string {
  return `#${id.replace(/-/g, '').slice(-5).toUpperCase()}`;
}

/** en-IN grouping (12,34,567) done by hand: Hermes does not always ship the en-IN locale. */
function groupIndian(digits: string): string {
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return rest ? `${rest.replace(/\B(?=(\d{2})+$)/g, ',')},${last3}` : last3;
}

/** `₹1,240` for whole rupees, `₹3,450.00` with `{paise: true}` (balances and withdrawals). */
export function formatRupees(amount: number, opts: {paise?: boolean} = {}): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const fixed = Math.abs(safe).toFixed(opts.paise ? 2 : 0);
  const [whole, fraction] = fixed.split('.');
  const sign = safe < 0 && Number(fixed) !== 0 ? '-' : '';
  return `${sign}₹${groupIndian(whole)}${fraction ? `.${fraction}` : ''}`;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** `2 min ago`, `3 hr ago`, `Yesterday`, then `13 Oct`. Empty for an unreadable timestamp. */
export function formatRelativeTime(iso: string, now: Date): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) {
    return '';
  }
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const daysApart = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (daysApart <= 0) {
    return `${Math.floor(minutes / 60)} hr ago`;
  }
  if (daysApart === 1) {
    return 'Yesterday';
  }
  return `${then.getDate()} ${MONTHS[then.getMonth()]}`;
}

function clock(hours: number, minutes: number): string {
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** `1:30 PM` in the phone's own time zone. */
export function formatTimeOfDay(date: Date): string {
  return clock(date.getHours(), date.getMinutes());
}

/** A schedule time such as `11:00:00` or `22:00` as `11:00 AM`. Empty when it is not a time. */
export function formatWindowTime(value: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value);
  return match ? clock(Number(match[1]), Number(match[2])) : '';
}
