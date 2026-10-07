package in.craves.integration.payout;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Only fixed, non-sensitive operation guidance may cross the finance API boundary. */
public final class ManualSettlementException extends ResponseStatusException {
    public enum Reason {
        MANUAL_SETTLEMENT_RUNTIME_DISABLED("Manual Craves payments are paused in the service configuration."),
        FINANCE_POLICY_NOT_ACTIVATED("Activate a reviewed finance policy before reserving a payment."),
        LEDGER_DISABLED_BY_POLICY("Ledger accounting is paused in the reviewed finance policy."),
        MANUAL_WITHDRAWALS_DISABLED_BY_POLICY("Manual withdrawals are paused in the reviewed finance policy."),
        JOURNAL_POSTING_DISABLED("Journal posting is paused. Restore it before authorizing a new transfer or recording a paid or returned bank payment."),
        CHEF_FINANCE_NOT_INITIALIZED("This chef has no initialized payable account. A verified captured and delivered earning is required before a payment can be reserved."),
        CHEF_PAYMENT_HELD("This chef's payment is held for financial review. Resolve the independent hold before reserving or authorizing a transfer."),
        DAILY_MANUAL_REQUEST_ALREADY_USED("This chef has already used today's manual payment request. The next request is available after midnight in India."),
        AVAILABLE_BALANCE_CHANGED("The available balance changed or is empty. Refresh the chef balance before reserving a payment."),
        SETTLEMENT_REQUEST_CONTEXT_CHANGED("This request was already used with different payment details. Refresh and review the saved instruction."),
        SETTLEMENT_ACTION_CONTEXT_CHANGED("This action was already used with different evidence. Refresh and review the recorded action."),
        SETTLEMENT_VERSION_CHANGED("Another operation changed this payment. Refresh the instruction before continuing."),
        SETTLEMENT_ACTION_NOT_ALLOWED("This action does not apply to the payment's current state. Refresh and choose an available action."),
        BANK_AMOUNT_MISMATCH("The actual bank amount must exactly match the reserved payment amount.");

        private final String detail;
        Reason(String detail) { this.detail=detail; }
        public String detail() { return detail; }
    }

    private final Reason operationReason;
    public ManualSettlementException(Reason reason) {
        super(HttpStatus.CONFLICT,reason.detail()); this.operationReason=reason;
    }
    public Reason operationReason() { return operationReason; }
}
