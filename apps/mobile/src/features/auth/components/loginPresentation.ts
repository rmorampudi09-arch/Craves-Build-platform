export function maskLoginPhone(phone: string): string {
  return `+91 ******${phone.slice(-4)}`;
}

export function formatLoginCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
