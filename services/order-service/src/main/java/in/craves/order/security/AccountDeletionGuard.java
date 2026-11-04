package in.craves.order.security;

import in.craves.order.exception.OrderApiException;

/** Blocks new orders while the customer side of the account has an open deletion request (token claim deletion_pending). */
public final class AccountDeletionGuard {
    private AccountDeletionGuard() {}

    public static void requireNoCustomerDeletion(CravesPrincipal principal) {
        String scope = principal.deletionPendingScope();
        if ("CUSTOMER".equals(scope) || "ALL".equals(scope)) {
            throw OrderApiException.conflict("ACCOUNT_DELETION_PENDING",
                "Your account is set to be deleted. Tap Keep my account to order again.");
        }
    }
}
