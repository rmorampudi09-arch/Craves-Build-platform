package in.craves.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.domain.AuthAudit;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.domain.AuthIdentityRole;
import in.craves.auth.domain.RefreshSession;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthAuditRepository;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import in.craves.auth.repository.AuthRoleRepository;
import in.craves.auth.repository.LoginAttemptRepository;
import in.craves.auth.repository.RefreshSessionRepository;
import in.craves.auth.security.CravesJwtService;
import in.craves.auth.security.RefreshTokenGenerator;
import in.craves.auth.security.RsaKeyProvider;
import in.craves.auth.security.TokenHasher;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

class RiderRoleServiceTest {
    private final AuthIdentityRepository identities = mock(AuthIdentityRepository.class);
    private final AuthRoleRepository roleCatalog = mock(AuthRoleRepository.class);
    private final AuthIdentityRoleRepository roles = mock(AuthIdentityRoleRepository.class);
    private final RefreshSessionRepository refreshes = mock(RefreshSessionRepository.class);
    private final AuthAuditRepository audits = mock(AuthAuditRepository.class);
    private final RefreshTokenGenerator generator = mock(RefreshTokenGenerator.class);
    private final TokenHasher hasher = new TokenHasher();
    private final UUID riderId = UUID.randomUUID();
    private AuthIdentity identity;
    private UUID id;
    private CravesJwtService jwt;
    private AuthService service;

    @BeforeEach
    void setUp() {
        identity = new AuthIdentity("synthetic-rider", "+10000000000");
        id = UUID.randomUUID();
        ReflectionTestUtils.setField(identity, "id", id);
        identity.setStatus("ACTIVE");
        when(identities.findById(id)).thenReturn(Optional.of(identity));
        when(roleCatalog.existsById("RIDER")).thenReturn(true);
        JwtProperties properties = new JwtProperties();
        properties.setAllowGeneratedLocalKeys(true);
        jwt = new CravesJwtService(properties, new RsaKeyProvider(properties), new ObjectMapper(), Clock.systemUTC());
        service = new AuthService(null, properties, identities, roleCatalog, roles, refreshes,
            mock(LoginAttemptRepository.class), audits, jwt, generator, hasher, mock(AdminSessionService.class));
    }

    @Test
    void grantAddsRiderOnceAndAuditsOnlyTheChange() {
        when(roles.existsByIdentityIdAndRoleCode(id, "RIDER")).thenReturn(false, true);
        when(roles.findRoleCodesByIdentityId(id)).thenReturn(List.of("CUSTOMER", "RIDER"));

        assertThat(service.grantRiderRole(id, riderId).roles()).containsExactly("CUSTOMER", "RIDER");
        assertThat(service.grantRiderRole(id, riderId).roles()).containsExactly("CUSTOMER", "RIDER");

        ArgumentCaptor<AuthIdentityRole> granted = ArgumentCaptor.forClass(AuthIdentityRole.class);
        verify(roles, times(1)).save(granted.capture());
        assertThat(granted.getValue().getRoleCode()).isEqualTo("RIDER");
        assertThat(granted.getValue().getIdentityId()).isEqualTo(id);
        assertThat(auditActions()).containsExactly("RIDER_ROLE_GRANTED");
        verify(identities, never()).incrementTokenVersion(any());
    }

    @Test
    void grantRefusesAnInactiveAccount() {
        identity.setStatus("SUSPENDED");

        assertThatThrownBy(() -> service.grantRiderRole(id, riderId))
            .isInstanceOfSatisfying(AuthException.class, error -> {
                assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
                assertThat(error.getCode()).isEqualTo("IDENTITY_NOT_ACTIVE");
            });
        verify(roles, never()).save(any());
    }

    @Test
    void revokeRemovesRiderBumpsTokenVersionOnceAndWorksForASuspendedAccount() {
        identity.setStatus("SUSPENDED");
        when(roles.deleteByIdentityIdAndRoleCode(id, "RIDER")).thenReturn(1L, 0L);
        when(roles.findRoleCodesByIdentityId(id)).thenReturn(List.of("CUSTOMER"));

        assertThat(service.revokeRiderRole(id, riderId).roles()).containsExactly("CUSTOMER");
        assertThat(service.revokeRiderRole(id, riderId).roles()).containsExactly("CUSTOMER");

        verify(identities, times(1)).incrementTokenVersion(id);
        assertThat(auditActions()).containsExactly("RIDER_ROLE_REVOKED");
    }

    @Test
    void unknownIdentityIsABadRequest() {
        UUID unknown = UUID.randomUUID();
        when(identities.findById(unknown)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.revokeRiderRole(unknown, riderId))
            .isInstanceOfSatisfying(AuthException.class, error -> assertThat(error.getCode()).isEqualTo("IDENTITY_NOT_FOUND"));
        assertThatThrownBy(() -> service.grantRiderRole(unknown, riderId))
            .isInstanceOfSatisfying(AuthException.class, error -> assertThat(error.getCode()).isEqualTo("IDENTITY_NOT_FOUND"));
    }

    @Test
    void riderIsInTheRefreshedAccessTokenAndGoneFromTheNextOneAfterRevoke() {
        session("synthetic-first");
        session("synthetic-second");
        when(generator.generate()).thenReturn("synthetic-second", "synthetic-third");
        when(refreshes.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(roles.findRoleCodesByIdentityId(id)).thenReturn(List.of("CUSTOMER", "PLATFORM_ADMIN", "RIDER"), List.of("CUSTOMER"));

        var granted = service.refresh("synthetic-first", null, new MockHttpServletRequest());
        assertThat(jwt.verifyAccessToken(granted.accessToken()).roles()).containsExactly("CUSTOMER", "RIDER");
        assertThat(granted.identity().roles()).containsExactly("CUSTOMER", "RIDER");

        var revoked = service.refresh("synthetic-second", null, new MockHttpServletRequest());
        assertThat(jwt.verifyAccessToken(revoked.accessToken()).roles()).containsExactly("CUSTOMER");
    }

    private void session(String refreshToken) {
        RefreshSession session = new RefreshSession(id, hasher.sha256Base64Url(refreshToken), "mobile", null, Instant.now().plusSeconds(86400));
        when(refreshes.findByRefreshTokenHash(session.getRefreshTokenHash())).thenReturn(Optional.of(session));
    }

    private List<Object> auditActions() {
        ArgumentCaptor<AuthAudit> saved = ArgumentCaptor.forClass(AuthAudit.class);
        verify(audits, atLeast(0)).save(saved.capture());
        return saved.getAllValues().stream().map(audit -> ReflectionTestUtils.getField(audit, "action")).toList();
    }
}
