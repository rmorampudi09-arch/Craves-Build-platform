export function createCorrelationId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `mobile-${Date.now().toString(36)}-${random}`;
}
