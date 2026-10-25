/** The order number everyone sees and quotes (same as web): first 8 characters of the id without dashes, uppercase. Callers add the "#". */
export function shortOrderNumber(orderId: string): string {
  return orderId.replace(/-/g, '').slice(0, 8).toUpperCase();
}
