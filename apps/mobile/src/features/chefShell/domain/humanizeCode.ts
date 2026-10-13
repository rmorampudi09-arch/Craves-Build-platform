/** `GOOD_PORTION` as `Good portion`: the fallback so a raw server code never reaches the chef. */
export function humanizeCode(code: string): string {
  const words = code.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
