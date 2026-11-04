package in.craves.auth.deletion;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.google.firebase.ErrorCode;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import in.craves.auth.deletion.AccountDeletionRepository.Contact;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.Via;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Real PostgreSQL: what auth's own erase step leaves of a person, and that their phone can sign up again. */
@EnabledIfEnvironmentVariable(named="EMAIL_TEST_DB_URL", matches=".+")
@ResourceLock("disposable-email-auth-migration-schemas")
class AuthAccountEraserDbTest {
    static final Instant NOW = Instant.parse("2026-11-04T10:00:00Z");
    static final List<String> HISTORY = List.of("referral_enrollment", "auth_email_projection_outbox", "auth_email_audit", "referral_source_outbox");
    static JdbcTemplate jdbc;
    static DataSourceTransactionManager transactions;
    final FirebaseAuth firebase = mock(FirebaseAuth.class);
    final AuthAccountEraser eraser = new AuthAccountEraser(jdbc, transactions, firebase);

    record Person(UUID id, String uid, String phone) {}

    @BeforeAll static void database() {
        var source = AccountDeletionRepositoryDbTest.migratedSchema("auth_account_eraser_test");
        jdbc = new JdbcTemplate(source);
        transactions = new DataSourceTransactionManager(source);
    }

    @Test void wipeAllLeavesNoPersonalDataInAuth() throws Exception {
        Person person = person(Scope.ALL), bystander = person(Scope.ALL);
        Map<String, Integer> bystanderRows = rows(bystander);
        Map<String, Integer> found = rows(person);
        Map<String, List<Map<String, Object>>> history = history();
        List<Map<String, Object>> revocations = jdbc.queryForList("SELECT * FROM auth_token_revocation_outbox ORDER BY id");
        assertEquals(new Contact(person.phone(), "synthetic-" + person.id() + "@example.test"),
            new AccountDeletionRepository(jdbc).contact(person.id()), "what the final notice is sent with, read before the wipe");

        Map<String, Integer> erased = eraser.erase(request(person.id(), Scope.ALL));

        verify(firebase).deleteUser(person.uid());
        Map<String, Integer> expected = new LinkedHashMap<>(found);
        expected.put("auth_identity", 1);
        assertEquals(expected, erased);
        assertTrue(found.values().stream().allMatch(count -> count > 0), "every table had a row to erase: " + found);
        assertTrue(rows(person).values().stream().allMatch(count -> count == 0), "left: " + rows(person));
        Map<String, Object> login = jdbc.queryForMap("SELECT * FROM auth_identity WHERE id = ?", person.id());
        assertEquals(person.id().toString().replace("-", ""), login.get("phone_number"));
        assertEquals("deleted:" + person.id(), login.get("firebase_uid"));
        assertEquals(false, login.get("email_verified"));
        assertEquals("SUSPENDED", login.get("status"));
        assertEquals(3L, login.get("token_version"), "one more than the lock's");
        for (String column : List.of("email", "display_name", "email_verified_at")) assertNull(login.get(column), column);
        assertEquals(new Contact(person.id().toString().replace("-", ""), null), new AccountDeletionRepository(jdbc).contact(person.id()));
        assertEquals(List.of(), jdbc.queryForList("SELECT ip_address || user_agent FROM auth_audit WHERE identity_id = ? "
            + "AND (ip_address IS NOT NULL OR user_agent IS NOT NULL)", String.class, person.id()));
        assertEquals(2, count("SELECT count(*) FROM auth_audit WHERE identity_id = ?", person.id()), "audit rows stay, scrubbed");
        assertEquals(history, history(), "immutable history is untouched");
        List<Map<String, Object>> revocationsAfter = jdbc.queryForList("SELECT * FROM auth_token_revocation_outbox ORDER BY id");
        assertTrue(revocationsAfter.containsAll(revocations), "earlier revocation events are untouched");
        assertEquals(revocations.size() + 1, revocationsAfter.size(), "the token_version bump is published");
        assertEquals(bystanderRows, rows(bystander), "nobody else's rows are touched");
    }

    @Test void samePhoneSignsUpAgainAfterWipe() throws Exception {
        Person person = person(Scope.ALL);
        eraser.erase(request(person.id(), Scope.ALL));

        UUID again = AccountLockDbTest.signIn(jdbc, transactions, person.uid(), person.phone()).id();

        assertNotEquals(person.id(), again);
        assertEquals(again, jdbc.queryForObject("SELECT id FROM auth_identity WHERE phone_number = ? AND firebase_uid = ?", UUID.class,
            person.phone(), person.uid()));
        assertEquals(List.of("CUSTOMER"), jdbc.queryForList("SELECT role_code FROM auth_identity_role WHERE identity_id = ?", String.class, again));
        assertEquals("deleted:" + person.id(), jdbc.queryForObject("SELECT firebase_uid FROM auth_identity WHERE id = ?", String.class, person.id()));
    }

    @Test void wipeRetryToleratesMissingFirebaseUser() throws Exception {
        Person person = person(Scope.ALL);
        Map<String, Integer> found = rows(person);
        doThrow(new FirebaseAuthException(ErrorCode.UNAVAILABLE, "synthetic outage", null, null, null))
            .doThrow(new FirebaseAuthException(ErrorCode.NOT_FOUND, "synthetic missing", null, null, AuthErrorCode.USER_NOT_FOUND))
            .when(firebase).deleteUser(person.uid());

        assertThrows(FirebaseAuthException.class, () -> eraser.erase(request(person.id(), Scope.ALL)));
        assertEquals(found, rows(person), "a Firebase outage erases nothing yet");

        eraser.erase(request(person.id(), Scope.ALL)); // the user was deleted by the first attempt after all

        assertTrue(rows(person).values().stream().allMatch(count -> count == 0), "left: " + rows(person));
        assertEquals("deleted:" + person.id(), jdbc.queryForObject("SELECT firebase_uid FROM auth_identity WHERE id = ?", String.class, person.id()));
    }

    @Test void wipeTwiceChangesNothingTheSecondTime() throws Exception {
        Person person = person(Scope.ALL);
        eraser.erase(request(person.id(), Scope.ALL));
        Map<String, Object> login = jdbc.queryForMap("SELECT * FROM auth_identity WHERE id = ?", person.id());
        Map<String, List<Map<String, Object>>> history = history();
        int revocations = count("SELECT count(*) FROM auth_token_revocation_outbox WHERE identity_id = ?", person.id());

        Map<String, Integer> second = eraser.erase(request(person.id(), Scope.ALL));

        assertTrue(second.values().stream().allMatch(count -> count == 0), "second: " + second);
        assertEquals(login, jdbc.queryForMap("SELECT * FROM auth_identity WHERE id = ?", person.id()));
        assertEquals(history, history());
        assertEquals(revocations, count("SELECT count(*) FROM auth_token_revocation_outbox WHERE identity_id = ?", person.id()));
        verify(firebase, times(1)).deleteUser(person.uid());
    }

    @Test void oneSideEraseRemovesThatRoleOnly() throws Exception {
        Person person = person(Scope.CHEF);

        assertEquals(Map.of("auth_identity_role", 0, "auth_identity", 1), eraser.erase(request(person.id(), Scope.CHEF)),
            "the lock removed the role already; old tokens are made stale again");

        assertEquals(List.of("CUSTOMER"), jdbc.queryForList("SELECT role_code FROM auth_identity_role WHERE identity_id = ?", String.class,
            person.id()));
        assertEquals("ACTIVE 3 " + person.phone(), jdbc.queryForObject("SELECT status || ' ' || token_version || ' ' || phone_number "
            + "FROM auth_identity WHERE id = ?", String.class, person.id()), "the login and the other side stay");
        assertEquals(1, count("SELECT count(*) FROM academy_schema.learner WHERE identity_id = ?", person.id()));
    }

    /**
     * A customer and chef with a row in every auth table that holds their data and immutable referral and email history,
     * locked for {@code scope} as on day 30 (token_version 2).
     */
    static Person person(Scope scope) {
        UUID id = UUID.randomUUID();
        Person person = new Person(id, "synthetic-" + id, "+91" + String.format("%010d", Math.floorMod(id.getLeastSignificantBits(), 10_000_000_000L)));
        String email = "synthetic-" + id + "@example.test";
        jdbc.update("INSERT INTO auth_identity (id, firebase_uid, phone_number, email, email_verified, email_verified_at, email_revision, "
            + "display_name) VALUES (?, ?, ?, ?, true, ?, 1, 'Synthetic Person')", id, person.uid(), person.phone(), email, ts(NOW));
        for (String role : List.of("CUSTOMER", "CHEF"))
            jdbc.update("INSERT INTO auth_identity_role (identity_id, role_code) VALUES (?, ?)", id, role);
        for (int session = 0; session < 2; session++)
            jdbc.update("INSERT INTO refresh_session (identity_id, refresh_token_hash, user_agent, ip_address, expires_at) "
                + "VALUES (?, ?, 'synthetic-agent', '192.0.2.1', ?)", id, "synthetic-" + UUID.randomUUID(), ts(NOW.plus(Duration.ofDays(1))));
        jdbc.update("INSERT INTO login_attempt (firebase_uid, success, ip_address) VALUES (?, false, '192.0.2.1')", person.uid());
        jdbc.update("INSERT INTO login_attempt (phone_number, success, user_agent) VALUES (?, false, 'synthetic-agent')", person.phone());
        jdbc.update("INSERT INTO auth_phone_otp (phone_hash, phone_number, updated_at) VALUES (?, ?, 0)", "synthetic-" + id, person.phone());
        UUID parent = UUID.randomUUID();
        challenge(id, parent, null, "SUPERSEDED", email);
        challenge(id, UUID.randomUUID(), parent, "PENDING", email);
        jdbc.update("INSERT INTO academy_schema.learner (identity_id) VALUES (?)", id);
        jdbc.update("INSERT INTO academy_schema.progress (identity_id, course_id, lesson_id, content_version) VALUES (?, 'c', 'l', 'v')", id);
        jdbc.update("INSERT INTO academy_schema.attempt (identity_id, request_id, course_id, lesson_id, content_version, request_hash, result) "
            + "VALUES (?, ?, 'c', 'l', 'v', 'h', '{}'::jsonb)", id, UUID.randomUUID());
        jdbc.update("INSERT INTO academy_schema.xp_ledger (identity_id, reward_key, xp) VALUES (?, 'k', 5)", id);
        jdbc.update("INSERT INTO academy_schema.activity (identity_id, request_id, course_id, lesson_id, kind) VALUES (?, ?, 'c', 'l', 'LESSON_OPEN')",
            id, UUID.randomUUID());
        jdbc.update("INSERT INTO auth_audit (identity_id, action, ip_address, user_agent) VALUES (?, 'FIREBASE_EXCHANGE', '192.0.2.1', 'synthetic-agent')", id);
        jdbc.update("INSERT INTO auth_audit (identity_id, action, ip_address) VALUES (?, 'LOGOUT', '192.0.2.1')", id);
        UUID event = UUID.randomUUID();
        jdbc.update("INSERT INTO referral_source_outbox (event_id, event_key, aggregate_id, content_hash, envelope) VALUES (?, ?, ?, ?, '{}')",
            event, "synthetic/" + id, id, "0".repeat(64));
        jdbc.update("INSERT INTO referral_enrollment (identity_id, event_id, terms_version, contact_hash, registered_at) VALUES (?, ?, 'v1', ?, ?)",
            id, event, "0".repeat(64), ts(NOW));
        jdbc.update("INSERT INTO auth_email_projection_outbox (event_id, identity_id, email, email_revision, verified_at, created_at, next_attempt_at) "
            + "VALUES (?, ?, ?, 1, ?, ?, ?)", UUID.randomUUID(), id, email, ts(NOW), ts(NOW), ts(NOW));
        jdbc.update("INSERT INTO auth_email_audit (id, identity_id, challenge_id, action, email_revision, created_at) VALUES (?, ?, ?, 'VERIFIED', 1, ?)",
            UUID.randomUUID(), id, parent, ts(NOW));
        new TransactionTemplate(transactions).executeWithoutResult(status -> new AccountLock(jdbc).lock(request(id, scope)));
        return person;
    }

    static void challenge(UUID identityId, UUID id, UUID parent, String status, String email) {
        jdbc.update("INSERT INTO auth_email_challenge (id, identity_id, request_id, parent_challenge_id, pending_email, recipient_key, code_mac, "
                + "status, created_at, expires_at, resend_available_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            id, identityId, UUID.randomUUID(), parent, email, "0".repeat(64), "0".repeat(64), status, ts(NOW),
            ts(NOW.plus(Duration.ofMinutes(10))), ts(NOW.plus(Duration.ofMinutes(1))));
    }

    /** The person's rows that auth's erase removes or scrubs, keyed as the eraser reports them. */
    static Map<String, Integer> rows(Person person) {
        Map<String, Integer> rows = new LinkedHashMap<>();
        rows.put("refresh_session", count("SELECT count(*) FROM refresh_session WHERE identity_id = ?", person.id()));
        rows.put("login_attempt", count("SELECT count(*) FROM login_attempt WHERE firebase_uid = ? OR phone_number = ?", person.uid(), person.phone()));
        rows.put("auth_phone_otp", count("SELECT count(*) FROM auth_phone_otp WHERE phone_number = ?", person.phone()));
        rows.put("auth_email_challenge", count("SELECT count(*) FROM auth_email_challenge WHERE identity_id = ?", person.id()));
        for (String table : List.of("progress", "attempt", "xp_ledger", "activity", "learner"))
            rows.put("academy_schema." + table, count("SELECT count(*) FROM academy_schema." + table + " WHERE identity_id = ?", person.id()));
        rows.put("auth_audit", count("SELECT count(*) FROM auth_audit WHERE identity_id = ? AND (ip_address IS NOT NULL OR user_agent IS NOT NULL)",
            person.id()));
        rows.put("auth_identity_role", count("SELECT count(*) FROM auth_identity_role WHERE identity_id = ? AND role_code IN ('CUSTOMER', 'CHEF')",
            person.id()));
        return rows;
    }

    static Map<String, List<Map<String, Object>>> history() {
        Map<String, List<Map<String, Object>>> rows = new LinkedHashMap<>();
        for (String table : HISTORY) rows.put(table, jdbc.queryForList("SELECT * FROM " + table + " ORDER BY 1"));
        return rows;
    }

    static int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    static DeletionRequest request(UUID identityId, Scope scope) {
        return new DeletionRequest(UUID.randomUUID(), identityId, scope, RequestStatus.ERASING, Via.APP, NOW, NOW, null, null, null, null, null,
            NOW, null, null, null, null);
    }

    static Timestamp ts(Instant instant) {
        return Timestamp.from(instant);
    }
}
