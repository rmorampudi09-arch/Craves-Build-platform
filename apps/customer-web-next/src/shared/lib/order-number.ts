/** The order number everyone sees and quotes (same as the app): first 8 characters of the id without dashes, uppercase. Callers add the "#". */
export function shortOrderNumber(orderId: string): string {
  return orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Support ticket number (same as the app): last 5 characters of the case's caseNumber ("CRV-…", not its id) without dashes, uppercase. Callers add the "#". */
export function supportCaseNumber(caseNumber: string): string {
  return caseNumber.replace(/-/g, "").slice(-5).toUpperCase();
}
