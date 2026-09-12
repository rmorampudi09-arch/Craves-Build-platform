package in.craves.auth.service;

import in.craves.auth.admin.InternalAdminRoles;
import in.craves.auth.api.AuthTokenResponse;
import in.craves.auth.api.IdentityResponse;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import in.craves.auth.security.AccessTokenClaims;
import in.craves.auth.security.CravesJwtService;
import in.craves.auth.security.RefreshTokenGenerator;
import in.craves.auth.security.TokenHasher;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminSessionService {
    public static final Duration ABSOLUTE_WINDOW = Duration.ofHours(8);
    private final JdbcTemplate jdbc;
    private final AuthIdentityRepository identities;
    private final AuthIdentityRoleRepository roles;
    private final CravesJwtService jwt;
    private final JwtProperties properties;
    private final RefreshTokenGenerator generator;
    private final TokenHasher hasher;
    private final Clock clock;

    public AdminSessionService(JdbcTemplate jdbc, AuthIdentityRepository identities,
        AuthIdentityRoleRepository roles, CravesJwtService jwt, JwtProperties properties,
        RefreshTokenGenerator generator, TokenHasher hasher, Clock clock) {
        this.jdbc = jdbc; this.identities = identities; this.roles = roles; this.jwt = jwt;
        this.properties = properties; this.generator = generator; this.hasher = hasher; this.clock = clock;
    }

    public static boolean isAdmin(List<String> values) {
        return values != null && values.stream().anyMatch(InternalAdminRoles.codes()::contains);
    }

    public static Instant deadline(Object authenticationTime, Instant now) {
        if (!(authenticationTime instanceof Number time)) throw rejected("ADMIN_REAUTHENTICATION_REQUIRED");
        Instant authenticated = Instant.ofEpochSecond(time.longValue());
        Instant deadline = authenticated.plus(ABSOLUTE_WINDOW);
        if (authenticated.isAfter(now.plusSeconds(30)) || !deadline.isAfter(now)) {
            throw rejected("ADMIN_REAUTHENTICATION_REQUIRED");
        }
        return deadline;
    }

    @Transactional
    public AuthTokenResponse create(AuthIdentity identity, List<String> currentRoles, Object authenticationTime) {
        Instant now = clock.instant();
        Instant end = deadline(authenticationTime, now);
        lockIdentity(identity.getId());
        var previous = jdbc.query("SELECT id, revoked_at FROM admin_session_family WHERE identity_id = ? AND authenticated_at = ?",
            (rs, row) -> new Object[] {rs.getObject("id", UUID.class), rs.getTimestamp("revoked_at")}, identity.getId(), Timestamp.from(end.minus(ABSOLUTE_WINDOW)));
        UUID family;
        if (!previous.isEmpty()) {
            if (previous.getFirst()[1] != null) throw rejected("ADMIN_REAUTHENTICATION_REQUIRED");
            family = (UUID) previous.getFirst()[0];
        } else {
        family = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO admin_session_family(id, identity_id, authenticated_at, expires_at, token_version)
            VALUES (?, ?, ?, ?, ?)
            """, family, identity.getId(), Timestamp.from(end.minus(ABSOLUTE_WINDOW)), Timestamp.from(end), identity.getTokenVersion());
        }
        String token = generator.generate();
        insertRefresh(UUID.randomUUID(), family, identity.getId(), token, now, end);
        return response(identity, currentRoles, token, family, end, now);
    }

    public boolean handles(String hash) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM refresh_session WHERE refresh_token_hash = ? AND admin_family_id IS NOT NULL)", Boolean.class, hash));
    }

    // The identity row is always locked before any session row, matching role/account administration.
    // AuthException must commit replay revocation rather than rolling it back with the 401 response.
    @Transactional(noRollbackFor = AuthException.class)
    public AuthTokenResponse refresh(String token, UUID requestId) {
        if (requestId == null) throw AuthException.badRequest("REFRESH_REQUEST_ID_REQUIRED", "A refresh request identifier is required");
        String hash = hasher.sha256Base64Url(token);
        UUID identityId = jdbc.queryForObject("SELECT identity_id FROM refresh_session WHERE refresh_token_hash = ?", UUID.class, hash);
        lockIdentity(identityId);
        Session s = session(hash);
        Instant now = clock.instant();
        AuthIdentity identity = identities.findById(identityId).orElseThrow(() -> rejected("IDENTITY_NOT_FOUND"));
        List<String> currentRoles = roles.findRoleCodesByIdentityId(identityId);
        if (!"ACTIVE".equals(identity.getStatus()) || identity.getTokenVersion() != s.tokenVersion() || !isAdmin(currentRoles)) {
            revoke(s.family(), "ADMIN_ACCESS_REVOKED", now);
            throw rejected("ADMIN_ACCESS_REVOKED");
        }
        if (s.familyRevoked() != null || !s.deadline().isAfter(now)) throw rejected("ADMIN_SESSION_EXPIRED");
        if (s.revoked() != null) {
            // A single ambiguous network attempt can retrieve its exact rotated result for 30 seconds.
            // A different receipt, expired grace, or already-used replacement is replay and revokes the family.
            if ("ROTATED".equals(s.reason()) && requestId.equals(s.requestId()) && s.revoked().plusSeconds(30).isAfter(now)
                && s.replacement() != null && activeReplacement(s.replacement())) {
                return response(identity, currentRoles, rotatedToken(token, s.replacement()), s.family(), s.deadline(), now);
            }
            revoke(s.family(), "REFRESH_REPLAY", now);
            throw rejected("REFRESH_TOKEN_REPLAYED");
        }
        UUID next = UUID.randomUUID();
        String nextToken = rotatedToken(token, next);
        insertRefresh(next, s.family(), identityId, nextToken, now, s.deadline());
        jdbc.update("""
            UPDATE refresh_session SET last_used_at = ?, revoked_at = ?, revoke_reason = 'ROTATED',
                replaced_by_session_id = ?, rotation_request_id = ? WHERE id = ?
            """, Timestamp.from(now), Timestamp.from(now), next, requestId, s.id());
        return response(identity, currentRoles, nextToken, s.family(), s.deadline(), now);
    }

    @Transactional
    public void logout(String hash) {
        UUID identity = jdbc.queryForObject("SELECT identity_id FROM refresh_session WHERE refresh_token_hash = ?", UUID.class, hash);
        lockIdentity(identity);
        Session s = session(hash);
        revoke(s.family(), "USER_LOGOUT", clock.instant());
    }

    @Transactional(readOnly = true)
    public void validate(AccessTokenClaims claims) {
        if (!isAdmin(claims.roles())) return;
        if (claims.adminSessionId() == null) throw rejected("ADMIN_REAUTHENTICATION_REQUIRED");
        Integer count = jdbc.queryForObject("""
            SELECT count(*) FROM admin_session_family f JOIN auth_identity i ON i.id = f.identity_id
            WHERE f.id = ? AND f.identity_id = ? AND f.revoked_at IS NULL AND f.expires_at > ?
              AND i.status = 'ACTIVE' AND i.token_version = ? AND f.token_version = i.token_version
              AND EXISTS(SELECT 1 FROM auth_identity_role r WHERE r.identity_id = i.id AND r.role_code IN
                ('PLATFORM_ADMIN','SUPPORT_ADMIN','PAYMENTS_ADMIN','OPERATIONS_ADMIN','CHEF_ADMIN',
                 'COMPLIANCE_ADMIN','SUBSCRIPTION_ADMIN','NOTIFICATION_ADMIN','AUDIT_ADMIN'))
            """, Integer.class, claims.adminSessionId(), claims.identityId(), Timestamp.from(clock.instant()), claims.tokenVersion());
        if (count == null || count != 1) throw rejected("ADMIN_SESSION_REVOKED");
    }

    private void lockIdentity(UUID identity) {
        jdbc.queryForObject("SELECT id FROM auth_identity WHERE id = ? FOR UPDATE", UUID.class, identity);
    }

    private void revoke(UUID family, String reason, Instant now) {
        // Existing V4 trigger durably publishes the higher token version to downstream Redis checks.
        // The version predicate prevents an old logout/replay from invalidating a later interactive sign-in.
        jdbc.update("""
            UPDATE auth_identity i SET token_version = i.token_version + 1, updated_at = ?
            FROM admin_session_family f WHERE f.id = ? AND f.identity_id = i.id
              AND f.revoked_at IS NULL AND i.token_version = f.token_version
            """, Timestamp.from(now), family);
        jdbc.update("UPDATE admin_session_family SET revoked_at = COALESCE(revoked_at, ?), revoke_reason = COALESCE(revoke_reason, ?) WHERE id = ?",
            Timestamp.from(now), reason, family);
        jdbc.update("UPDATE refresh_session SET revoked_at = COALESCE(revoked_at, ?), revoke_reason = CASE WHEN revoked_at IS NULL THEN ? ELSE revoke_reason END WHERE admin_family_id = ?",
            Timestamp.from(now), reason, family);
    }

    private boolean activeReplacement(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM refresh_session WHERE id = ? AND revoked_at IS NULL)", Boolean.class, id));
    }

    private String rotatedToken(String previous, UUID next) {
        return hasher.sha256Base64Url("craves-admin-rotation-v1:" + previous + ":" + next);
    }

    private void insertRefresh(UUID id, UUID family, UUID identity, String token, Instant now, Instant end) {
        jdbc.update("""
            INSERT INTO refresh_session(id, identity_id, refresh_token_hash, created_at, expires_at, admin_family_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """, id, identity, hasher.sha256Base64Url(token), Timestamp.from(now), Timestamp.from(end), family);
    }

    private AuthTokenResponse response(AuthIdentity identity, List<String> currentRoles, String token, UUID family, Instant end, Instant now) {
        Instant accessEnd = now.plus(properties.getAccessTokenTtl());
        if (accessEnd.isAfter(end)) accessEnd = end;
        long seconds = Duration.between(now, accessEnd).toSeconds();
        if (seconds < 1) throw rejected("ADMIN_SESSION_EXPIRED");
        String access = jwt.issueAccessToken(identity, currentRoles, accessEnd, family, end.minus(ABSOLUTE_WINDOW));
        return AuthTokenResponse.create(access, seconds, token, end, new IdentityResponse(identity.getId(), identity.getFirebaseUid(),
            identity.getPhoneNumber(), identity.getEmail(), identity.isEmailVerified(), identity.getDisplayName(), identity.getStatus(), currentRoles, identity.getLastLoginAt()));
    }

    private Session session(String hash) {
        return jdbc.queryForObject("""
            SELECT r.id, r.admin_family_id, r.revoked_at, r.revoke_reason, r.replaced_by_session_id, r.rotation_request_id,
                   f.expires_at, f.revoked_at AS family_revoked, f.token_version
            FROM refresh_session r JOIN admin_session_family f ON f.id = r.admin_family_id WHERE r.refresh_token_hash = ?
            """, (rs, row) -> new Session(rs.getObject("id", UUID.class), rs.getObject("admin_family_id", UUID.class),
            rs.getTimestamp("expires_at").toInstant(), rs.getLong("token_version"), instant(rs.getTimestamp("revoked_at")),
            instant(rs.getTimestamp("family_revoked")), rs.getString("revoke_reason"), rs.getObject("replaced_by_session_id", UUID.class),
            rs.getObject("rotation_request_id", UUID.class)), hash);
    }

    private static Instant instant(Timestamp value) { return value == null ? null : value.toInstant(); }
    private static AuthException rejected(String code) { return AuthException.unauthorized(code, "Administrator sign-in is required"); }
    private record Session(UUID id, UUID family, Instant deadline, long tokenVersion, Instant revoked,
        Instant familyRevoked, String reason, UUID replacement, UUID requestId) {}
}
