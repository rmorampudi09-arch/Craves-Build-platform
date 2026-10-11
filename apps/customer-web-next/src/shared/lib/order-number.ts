/** The short order number customers see and quote: last 6 characters, uppercase. */
export function shortOrderNumber(orderId: string): string {
  return orderId.slice(-6).toUpperCase();
}
