package in.craves.auth.deletion;

import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Closes the side being erased before the first erase call (plan Decision 2). Call inside the transaction that moves the
 * request to ERASING. The token_version bump makes the V4 trigger publish the new minimum version, so every live access
 * token of this person is rejected and the next one carries no erased role.
 */
@Component
public class AccountLock {
    private final JdbcTemplate jdbc;

    public AccountLock(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void lock(DeletionRequest request) {
        switch (request.scope()) {
            case ALL -> {
                jdbc.update("UPDATE auth_identity SET status = 'SUSPENDED', token_version = token_version + 1, updated_at = now() "
                    + "WHERE id = ?", request.identityId());
                jdbc.update("UPDATE refresh_session SET revoked_at = now(), revoke_reason = 'ACCOUNT_DELETION' "
                    + "WHERE identity_id = ? AND revoked_at IS NULL", request.identityId());
            }
            case CUSTOMER, CHEF -> {
                jdbc.update("DELETE FROM auth_identity_role WHERE identity_id = ? AND role_code = ?",
                    request.identityId(), request.scope().name());
                jdbc.update("UPDATE auth_identity SET token_version = token_version + 1, updated_at = now() WHERE id = ?",
                    request.identityId());
            }
        }
    }
}
