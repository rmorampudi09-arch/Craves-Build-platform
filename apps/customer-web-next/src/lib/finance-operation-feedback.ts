const financeMessages: Record<string, string> = {
  MANUAL_SETTLEMENT_RUNTIME_DISABLED: "Manual payments are paused in the service configuration. Existing payment records can still be reviewed.",
  FINANCE_POLICY_NOT_ACTIVATED: "Save and activate an approved finance policy before creating new payments.",
  LEDGER_DISABLED_BY_POLICY: "Ledger posting is paused in the active finance policy.",
  MANUAL_WITHDRAWALS_DISABLED_BY_POLICY: "Chef withdrawal requests are paused in the active finance policy.",
  JOURNAL_POSTING_DISABLED: "The earnings journal is paused in the service configuration. New payments cannot be recorded until it is enabled.",
  CHEF_FINANCE_NOT_INITIALIZED: "This chef has no verified earnings account yet. A captured and delivered order must reach the finance ledger before payment is available.",
  CHEF_PAYMENT_HELD: "This chef has a financial hold. Review its reason before releasing it.",
  DAILY_MANUAL_REQUEST_ALREADY_USED: "This chef already used today’s accepted withdrawal. Review existing instructions or wait until the next India calendar day.",
  NO_AVAILABLE_EARNINGS: "This chef has no earnings currently available for a new payment.",
  AVAILABLE_BALANCE_CHANGED: "The available balance changed. Refresh the chef’s balance and review the amount before retrying.",
  SETTLEMENT_REQUEST_CONTEXT_CHANGED: "This request no longer matches the chef or amount. Refresh and review the payment before retrying.",
  SETTLEMENT_ACTION_CONTEXT_CHANGED: "This request no longer matches the payment action. Refresh and review its current state.",
  SETTLEMENT_VERSION_CHANGED: "Another administrator updated this payment. Refresh to review the latest version.",
  SETTLEMENT_ACTION_NOT_ALLOWED: "This action is unavailable for the current payment state. Refresh and choose an available action.",
  BANK_AMOUNT_MISMATCH: "The actual bank amount must match the selected payment exactly.",
  INVALID_MANUAL_SETTLEMENT_REQUEST: "Complete the reason, exact amount and required bank evidence for the selected action.",
  MANUAL_SETTLEMENT_CONTEXT_UNVERIFIED: "The payment context could not be verified. Refresh the record before continuing.",
  MANUAL_SETTLEMENT_STATE_CONFLICT: "The payment changed or is busy. Refresh and review the original instruction before retrying.",
  AUTHORITATIVE_ORDER_SNAPSHOT_AND_CAPTURE_WIRING_NOT_CERTIFIED: "The connection between accepted orders, captured payments and the ledger still requires verification.",
};

export const safeManualSettlementErrorCodes = new Set([
  ...Object.keys(financeMessages).filter(code => code !== "AUTHORITATIVE_ORDER_SNAPSHOT_AND_CAPTURE_WIRING_NOT_CERTIFIED"),
  "MANUAL_SETTLEMENT_REQUEST_REJECTED",
]);

export function financeBlockerLabel(code: string): string {
  return financeMessages[code] || code.replaceAll("_", " ").toLowerCase();
}

export function financeErrorMessage(status: number, code?: string, detail?: string): string {
  if (status === 401 || code === "SESSION_EXPIRED") return "Your admin session expired. Sign in again, then retry this action.";
  if (status === 403) return "Your account is not authorized for this finance action. Ask an approved administrator to check your access.";
  if (code && financeMessages[code]) return financeMessages[code];
  if (detail) return detail;
  if (status === 409) return "The finance record changed or the action is paused. Refresh its current state before retrying.";
  if (status >= 500) return "The finance service is temporarily unavailable. Retry loading this record; its outcome has not been assumed.";
  return "The finance action was not confirmed. Check the required fields and refresh its current state before retrying.";
}
