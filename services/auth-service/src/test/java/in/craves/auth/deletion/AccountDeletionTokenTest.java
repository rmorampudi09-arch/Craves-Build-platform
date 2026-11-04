package in.craves.auth.deletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.api.IdentityResponse.PendingDeletion;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.Via;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.domain.RefreshSession;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import in.craves.auth.repository.AuthRoleRepository;
import in.craves.auth.repository.LoginAttemptRepository;
import in.craves.auth.repository.AuthAuditRepository;
import in.craves.auth.repository.RefreshSessionRepository;
import in.craves.auth.security.CravesJwtService;
import in.craves.auth.security.CurrentUser;
import in.craves.auth.security.RefreshTokenGenerator;
import in.craves.auth.security.RsaKeyProvider;
import in.craves.auth.security.TokenHasher;
import in.craves.auth.service.AdminSessionService;
import in.craves.auth.service.AuthService;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

/** The deletion_pending claim and the /me banner field, with a real token signer and a real AccountDeletionService. */
class AccountDeletionTokenTest {
    static final Instant NOW = Instant.parse("2026-11-04T10:00:00Z");

    final ObjectMapper mapper = new ObjectMapper();
    final TokenHasher hasher = new TokenHasher();
    final AccountDeletionRepository deletions = mock(AccountDeletionRepository.class);
    final AuthIdentityRepository identities = mock(AuthIdentityRepository.class);
    final AuthIdentityRoleRepository roles = mock(AuthIdentityRoleRepository.class);
    final RefreshSessionRepository refreshes = mock(RefreshSessionRepository.class);
    final RefreshTokenGenerator generator = mock(RefreshTokenGenerator.class);
    final AtomicReference<DeletionRequest> open = new AtomicReference<>();
    final UUID id = UUID.randomUUID();
    final CurrentUser user = new CurrentUser(id, "synthetic", "+10000000000", List.of("CUSTOMER"), 1L);
    AuthIdentity identity;
    CravesJwtService jwt;
    AccountDeletionService deletionService;
    AuthService authService;

    @BeforeEach
    void setUp() {
        identity = new AuthIdentity("synthetic", "+10000000000");
        ReflectionTestUtils.setField(identity, "id", id);
        identity.setStatus("ACTIVE");
        when(identities.findById(id)).thenReturn(Optional.of(identity));
        when(roles.findRoleCodesByIdentityId(id)).thenReturn(List.of("CUSTOMER"));
        when(refreshes.save(any())).thenAnswer(call -> call.getArgument(0));
        when(generator.generate()).thenReturn("synthetic-next", "synthetic-last");
        when(deletions.findOpen(id)).thenAnswer(call -> Optional.ofNullable(open.get()));
        when(deletions.lockOpen(id)).thenAnswer(call -> Optional.ofNullable(open.get()));
        when(deletions.transition(any(), any(), eq(RequestStatus.CANCELLED), any())).thenAnswer(call -> {
            open.set(null);
            return true;
        });
        when(deletions.find(any())).thenAnswer(call -> Optional.of(row(RequestStatus.CANCELLED)));
        JwtProperties properties = new JwtProperties();
        properties.setAllowGeneratedLocalKeys(true);
        jwt = new CravesJwtService(properties, new RsaKeyProvider(properties), mapper, Clock.systemUTC());
        var enabled = new AccountDeletionProperties();
        enabled.setEnabled(true);
        deletionService = new AccountDeletionService(deletions, identities, roles, mock(DeletionNotices.class), mock(AccountErasureClient.class), enabled,
            mock(PlatformTransactionManager.class), Clock.fixed(NOW, java.time.ZoneOffset.UTC), Runnable::run);
        authService = new AuthService(null, properties, identities, mock(AuthRoleRepository.class), roles, refreshes,
            mock(LoginAttemptRepository.class), mock(AuthAuditRepository.class), jwt, generator, hasher,
            mock(AdminSessionService.class), deletionService);
    }

    @Test
    void tokenCarriesDeletionPendingWhileOpenAndNotAfterKeep() throws Exception {
        open.set(row(RequestStatus.SCHEDULED));
        session("synthetic-first");
        session("synthetic-next");

        var whileOpen = authService.refresh("synthetic-first", null, new MockHttpServletRequest());
        assertThat(claims(whileOpen.accessToken())).containsEntry("deletion_pending", "CUSTOMER");

        deletionService.keep(user);

        var afterKeep = authService.refresh("synthetic-next", null, new MockHttpServletRequest());
        assertThat(claims(afterKeep.accessToken())).doesNotContainKey("deletion_pending");
        assertThat(afterKeep.identity().pendingDeletion()).isNull();
    }

    @Test
    void theTokenResponseIdentityShowsTheSameOpenRequest() {
        open.set(row(RequestStatus.PENDING_REVIEW));
        session("synthetic-first");

        var response = authService.refresh("synthetic-first", null, new MockHttpServletRequest());

        assertThat(response.identity().pendingDeletion()).isEqualTo(
            new PendingDeletion(open.get().id(), "CUSTOMER", "PENDING_REVIEW", null));
    }

    @Test
    void tokensWithNoOpenRequestAndAdminTokensHaveNoClaim() throws Exception {
        assertThat(claims(jwt.issueAccessToken(identity, List.of("CUSTOMER")))).doesNotContainKey("deletion_pending");
        assertThat(claims(jwt.issueAccessToken(identity, List.of("CUSTOMER"), null))).doesNotContainKey("deletion_pending");
        assertThat(claims(jwt.issueAccessToken(identity, List.of("PLATFORM_ADMIN"), Instant.now().plusSeconds(60),
            UUID.randomUUID(), Instant.now()))).doesNotContainKey("deletion_pending");
        assertThat(claims(jwt.issueAccessToken(identity, List.of("CUSTOMER"), "CHEF"))).containsEntry("deletion_pending", "CHEF");
    }

    @Test
    void meShowsPendingDeletionForTheBanner() {
        open.set(new DeletionRequest(UUID.randomUUID(), id, Scope.ALL, RequestStatus.WAITING_ON_OPEN_ITEMS, Via.APP, NOW,
            NOW.plusSeconds(3600), null, null, null, null, null, null, null, null, null, null));

        var me = authService.me(user);

        assertThat(me.pendingDeletion()).isEqualTo(new PendingDeletion(open.get().id(), "ALL", "WAITING_ON_OPEN_ITEMS", NOW.plusSeconds(3600)));
    }

    @Test
    void meShowsNothingWhenNoRequestIsOpen() {
        assertThat(authService.me(user).pendingDeletion()).isNull();

        open.set(null);
        when(deletions.findLatest(id)).thenReturn(Optional.of(row(RequestStatus.REJECTED)));
        assertThat(authService.me(user).pendingDeletion()).isNull();
    }

    private DeletionRequest row(RequestStatus status) {
        return new DeletionRequest(UUID.randomUUID(), id, Scope.CUSTOMER, status, Via.APP, NOW, null, null, null, null,
            null, null, null, null, null, null, null);
    }

    private void session(String refreshToken) {
        RefreshSession session = new RefreshSession(id, hasher.sha256Base64Url(refreshToken), "mobile", null, Instant.now().plusSeconds(86400));
        when(refreshes.findByRefreshTokenHash(session.getRefreshTokenHash())).thenReturn(Optional.of(session));
    }

    private Map<String, Object> claims(String token) throws Exception {
        return mapper.readValue(Base64.getUrlDecoder().decode(token.split("\\.")[1]), new TypeReference<>() { });
    }
}
