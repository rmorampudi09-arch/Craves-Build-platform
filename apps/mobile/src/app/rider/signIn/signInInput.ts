/**
 * The 10-digit mobile number in what the rider typed, pasted or autofilled: "98480 12345", "+91 98480 12345",
 * "098480-12345". A country code or trunk 0 goes only when ten digits are left, so typing an extra digit never shifts
 * the number; extra digits are ignored.
 */
export function mobileDigits(text: string): string {
  const digits = text.replace(/\D/g, '');
  for (const prefix of ['0091', '91', '0']) {
    if (digits.length === prefix.length + 10 && digits.startsWith(prefix)) {
      return digits.slice(prefix.length);
    }
  }
  return digits.slice(0, 10);
}

/** The 6-digit code in what arrived: typed digits, a pasted "482 615", or a whole SMS ("482615 is your Craves code"). */
export function codeDigits(text: string): string {
  const alone = /(?:^|\D)(\d{6})(?:\D|$)/.exec(text);
  return alone && /[^\d\s]/.test(text) ? alone[1] : text.replace(/\D/g, '').slice(0, 6);
}
