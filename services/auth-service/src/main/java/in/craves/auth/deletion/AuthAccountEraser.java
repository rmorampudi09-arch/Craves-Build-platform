package in.craves.auth.deletion;

import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.Scope;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Auth's own ERASE step, run after every other service. A whole account: the Firebase user is deleted first, outside any
 * transaction, then one transaction removes the person's login data and turns the identity into a tombstone that frees the
 * phone and the Firebase uid for a new sign-up. One side: that role is removed (the lock did it already) and old tokens are
 * made stale. Returns the rows changed per table; a whole-account wipe run again changes nothing. Immutable history
 * (referral_enrollment, auth_email_projection_outbox, auth_email_audit, referral_source_outbox, auth_token_revocation_outbox)
 * is never touched.
 */
@Component
public class AuthAccountEraser {
    private static final String TOMBSTONE_UID = "deleted:";
    /** learner last: the other academy tables reference it. */
    private static final List<String> ACADEMY = List.of("progress", "attempt", "xp_ledger", "activity", "learner");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final FirebaseAuth firebase;

    @Autowired
    public AuthAccountEraser(JdbcTemplate jdbc, PlatformTransactionManager transactions, FirebaseApp app) {
        this(jdbc, transactions, FirebaseAuth.getInstance(app));
    }

    AuthAccountEraser(JdbcTemplate jdbc, PlatformTransactionManager transactions, FirebaseAuth firebase) {
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(transactions);
        this.firebase = firebase;
    }

    public Map<String, Integer> erase(DeletionRequest request) throws FirebaseAuthException {
        UUID id = request.identityId();
        if (request.scope() != Scope.ALL) {
            return tx.execute(status -> Map.of(
                "auth_identity_role", jdbc.update("DELETE FROM auth_identity_role WHERE identity_id = ? AND role_code = ?", id,
                    request.scope().name()),
                "auth_identity", jdbc.update("UPDATE auth_identity SET token_version = token_version + 1, updated_at = now() WHERE id = ?", id)));
        }
        String tombstone = TOMBSTONE_UID + id;
        String uid = jdbc.queryForObject("SELECT firebase_uid FROM auth_identity WHERE id = ?", String.class, id);
        if (!tombstone.equals(uid)) {
            try {
                firebase.deleteUser(uid);
            } catch (FirebaseAuthException error) {
                // Deleted by an earlier attempt whose transaction did not commit, or never there: done either way.
                if (error.getAuthErrorCode() != AuthErrorCode.USER_NOT_FOUND) throw error;
            }
        }
        return tx.execute(status -> wipe(id, tombstone));
    }

    private Map<String, Integer> wipe(UUID id, String tombstone) {
        // Read again under the row lock: on a second run these are the tombstone values, which match nobody's rows.
        Map<String, Object> login = jdbc.queryForMap("SELECT firebase_uid, phone_number FROM auth_identity WHERE id = ? FOR UPDATE", id);
        Object uid = login.get("firebase_uid"), phone = login.get("phone_number");
        Map<String, Integer> rows = new LinkedHashMap<>();
        rows.put("refresh_session", jdbc.update("DELETE FROM refresh_session WHERE identity_id = ?", id));
        rows.put("login_attempt", jdbc.update("DELETE FROM login_attempt WHERE firebase_uid = ? OR phone_number = ?", uid, phone));
        rows.put("auth_phone_otp", jdbc.update("DELETE FROM auth_phone_otp WHERE phone_number = ?", phone));
        // A resent challenge points at the one it replaced: children first.
        rows.put("auth_email_challenge",
            jdbc.update("DELETE FROM auth_email_challenge WHERE identity_id = ? AND parent_challenge_id IS NOT NULL", id)
                + jdbc.update("DELETE FROM auth_email_challenge WHERE identity_id = ?", id));
        for (String table : ACADEMY) {
            rows.put("academy_schema." + table, jdbc.update("DELETE FROM academy_schema." + table + " WHERE identity_id = ?", id));
        }
        rows.put("auth_audit", jdbc.update("UPDATE auth_audit SET ip_address = NULL, user_agent = NULL "
            + "WHERE identity_id = ? AND (ip_address IS NOT NULL OR user_agent IS NOT NULL)", id));
        rows.put("auth_identity_role", jdbc.update("DELETE FROM auth_identity_role WHERE identity_id = ? AND role_code IN ('CUSTOMER', 'CHEF')", id));
        // The row stays (immutable history references it); phone_number and firebase_uid are UNIQUE, so the tombstone frees them.
        rows.put("auth_identity", jdbc.update("UPDATE auth_identity SET phone_number = ?, firebase_uid = ?, email = NULL, display_name = NULL, "
                + "email_verified = false, email_verified_at = NULL, status = 'SUSPENDED', token_version = token_version + 1, updated_at = now() "
                + "WHERE id = ? AND firebase_uid <> ?",
            id.toString().replace("-", ""), tombstone, id, tombstone));
        return rows;
    }
}
