package in.craves.auth.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import in.craves.auth.api.AuthTokenResponse;
import in.craves.auth.api.FirebaseExchangeRequest;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.*;
import in.craves.auth.security.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.MockedStatic;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(OutputCaptureExtension.class)
class AdminSecondFactorTest {
    static final String PHONE = "+10000000000";
    static final String ID_TOKEN = "synthetic-id-token";
    static final UUID IDENTITY = UUID.randomUUID();
    static final long AUTH_TIME = Instant.now().getEpochSecond();

    static AdminSessionService policy(boolean enforced) {
        return new AdminSessionService(null, null, null, null, null, null, null, null, enforced);
    }

    // Enforcing policy with family creation stubbed, so a test sees whether the exchange would create a family.
    static AdminSessionService sessions() {
        AdminSessionService sessions = spy(policy(true));
        doReturn(AuthTokenResponse.create("synthetic-admin", 900, "synthetic-admin-refresh", Instant.now(), null))
            .when(sessions).create(any(), any(), any());
        return sessions;
    }

    static Map<String, Object> claims(Object firebase) {
        Map<String, Object> claims = new HashMap<>(Map.of("phone_number", PHONE, "auth_time", AUTH_TIME));
        if (firebase != null) claims.put("firebase", firebase);
        return claims;
    }

    @Test void enforcedModeRefusesEverySignInWithoutAnAuthenticatorCode() {
        List<Object> signIns = Arrays.asList(Map.of("sign_in_provider", "phone"), Map.of("sign_in_provider", "custom"),
            Map.of("sign_in_provider", "anonymous"), Map.of("sign_in_provider", "password"),
            Map.of("sign_in_provider", "password", "sign_in_second_factor", "phone"), "not-a-map", null);
        for (Object signIn : signIns) {
            AuthException error = assertThrows(AuthException.class, () -> policy(true).requireSecondFactor(claims(signIn)), String.valueOf(signIn));
            assertEquals("ADMIN_SECOND_FACTOR_REQUIRED", error.getCode());
            assertEquals(HttpStatus.UNAUTHORIZED, error.getStatus());
        }
    }

    @Test void enforcedModeAcceptsTotpWithoutAnAlert(CapturedOutput output) {
        assertDoesNotThrow(() -> policy(true).requireSecondFactor(claims(Map.of("sign_in_provider", "password", "sign_in_second_factor", "totp"))));
        assertFalse(output.getAll().contains("CRAVES_ALERT"));
    }

    @Test void monitorModeReportsWithoutPersonalDataButAllows(CapturedOutput output) {
        assertDoesNotThrow(() -> policy(false).requireSecondFactor(claims(Map.of("sign_in_provider", "phone"))));
        assertTrue(output.getAll().contains("CRAVES_ALERT alert=ADMIN_SECOND_FACTOR_MISSING mode=monitor provider=phone secondFactor=none"));
        assertFalse(output.getAll().contains(PHONE));
    }

    @Test void unexpectedClaimTextIsNotLogged(CapturedOutput output) {
        assertThrows(AuthException.class, () -> policy(true).requireSecondFactor(
            claims(Map.of("sign_in_provider", "x\nCRAVES_ALERT alert=FAKE", "sign_in_second_factor", "TOTP"))));
        assertTrue(output.getAll().contains("mode=enforce provider=other secondFactor=other"));
        assertFalse(output.getAll().contains("alert=FAKE"));
    }

    @Test void adminSessionWithoutTotpIsRefusedBeforeAnyFamilyIsCreated() throws Exception {
        AdminSessionService sessions = sessions();
        try (MockedStatic<FirebaseAuth> firebase = mockStatic(FirebaseAuth.class)) {
            AuthService service = exchange(firebase, sessions, Map.of("sign_in_provider", "phone"), List.of("CUSTOMER", "PLATFORM_ADMIN"));
            AuthException error = assertThrows(AuthException.class, () -> service.exchangeFirebaseToken(new FirebaseExchangeRequest(ID_TOKEN, true), new MockHttpServletRequest()));
            assertEquals("ADMIN_SECOND_FACTOR_REQUIRED", error.getCode());
            verify(sessions, never()).create(any(), any(), any());
        }
    }

    @Test void totpAdministratorGetsTheAdminFamily() throws Exception {
        AdminSessionService sessions = sessions();
        try (MockedStatic<FirebaseAuth> firebase = mockStatic(FirebaseAuth.class)) {
            List<String> roles = List.of("CUSTOMER", "PLATFORM_ADMIN");
            AuthService service = exchange(firebase, sessions, Map.of("sign_in_provider", "password", "sign_in_second_factor", "totp"), roles);
            assertEquals("synthetic-admin", service.exchangeFirebaseToken(new FirebaseExchangeRequest(ID_TOKEN, true), new MockHttpServletRequest()).accessToken());
            verify(sessions).create(any(AuthIdentity.class), eq(roles), eq(AUTH_TIME));
        }
    }

    @Test void consumerExchangesNeverAskForASecondFactor() throws Exception {
        AdminSessionService sessions = sessions();
        try (MockedStatic<FirebaseAuth> firebase = mockStatic(FirebaseAuth.class)) {
            // Mobile never sends adminSession; a customer may send it from the admin portal.
            AuthTokenResponse mobile = exchange(firebase, sessions, Map.of("sign_in_provider", "phone"), List.of("CUSTOMER", "PLATFORM_ADMIN"))
                .exchangeFirebaseToken(new FirebaseExchangeRequest(ID_TOKEN, null), new MockHttpServletRequest());
            AuthTokenResponse customer = exchange(firebase, sessions, Map.of("sign_in_provider", "phone"), List.of("CUSTOMER"))
                .exchangeFirebaseToken(new FirebaseExchangeRequest(ID_TOKEN, true), new MockHttpServletRequest());
            for (AuthTokenResponse response : List.of(mobile, customer)) {
                assertEquals(900, response.expiresIn());
                assertTrue(response.refreshTokenExpiresAt().isAfter(Instant.now().plusSeconds(30L * 86400 - 60)));
                assertEquals(List.of("CUSTOMER"), response.identity().roles());
            }
            verify(sessions, never()).requireSecondFactor(any());
            verify(sessions, never()).create(any(), any(), any());
        }
    }

    static AuthService exchange(MockedStatic<FirebaseAuth> firebase, AdminSessionService sessions, Object signIn, List<String> roles) throws Exception {
        FirebaseToken token = mock(FirebaseToken.class);
        when(token.getUid()).thenReturn("synthetic-staff");
        when(token.getClaims()).thenReturn(claims(signIn));
        FirebaseAuth auth = mock(FirebaseAuth.class);
        when(auth.verifyIdToken(ID_TOKEN, true)).thenReturn(token);
        firebase.when(() -> FirebaseAuth.getInstance(any())).thenReturn(auth);
        var identities = mock(AuthIdentityRepository.class);
        when(identities.save(any())).thenAnswer(call -> {
            AuthIdentity identity = call.getArgument(0);
            ReflectionTestUtils.setField(identity, "id", IDENTITY);
            return identity;
        });
        var roleCatalog = mock(AuthRoleRepository.class);
        when(roleCatalog.existsById("CUSTOMER")).thenReturn(true);
        var identityRoles = mock(AuthIdentityRoleRepository.class);
        when(identityRoles.existsByIdentityIdAndRoleCode(any(), any())).thenReturn(true);
        when(identityRoles.findRoleCodesByIdentityId(IDENTITY)).thenReturn(roles);
        var jwt = mock(CravesJwtService.class);
        when(jwt.issueAccessToken(any(), any())).thenReturn("synthetic-access");
        var generator = mock(RefreshTokenGenerator.class);
        when(generator.generate()).thenReturn("synthetic-refresh");
        return new AuthService(null, new JwtProperties(), identities, roleCatalog, identityRoles, mock(RefreshSessionRepository.class),
            mock(LoginAttemptRepository.class), mock(AuthAuditRepository.class), jwt, generator, new TokenHasher(), sessions);
    }
}
