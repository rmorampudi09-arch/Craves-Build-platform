/** The order number everyone sees and quotes (same as the app): first 8 characters of the id without dashes, uppercase. Callers add the "#". */
export function shortOrderNumber(orderId: string): string {
  return orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Support ticket number (same as the app): last 5 characters without dashes, uppercase. Pass the case's caseNumber ("CRV-…"); callers add the "#". */
export function supportCaseNumber(caseId: string): string {
  return caseId.replace(/-/g, "").slice(-5).toUpperCase();
}
