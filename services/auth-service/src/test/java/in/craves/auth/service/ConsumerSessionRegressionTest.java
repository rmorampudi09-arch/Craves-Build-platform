package in.craves.auth.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import in.craves.auth.api.FirebaseExchangeRequest;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.domain.RefreshSession;
import in.craves.auth.repository.*;
import in.craves.auth.security.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

class ConsumerSessionRegressionTest {
    @Test void mobileRequestWithoutNewFieldKeepsConsumerContext() throws Exception {
        var request = new ObjectMapper().readValue("{\"firebaseIdToken\":\"synthetic-test\"}", FirebaseExchangeRequest.class);
        assertNull(request.adminSession());
    }

    @Test void staffUsingConsumerRefreshKeepsThirtyDaysAndCannotElevateIntoAdmin() {
        var identities = mock(AuthIdentityRepository.class);
        var roles = mock(AuthIdentityRoleRepository.class);
        var refreshes = mock(RefreshSessionRepository.class);
        var jwt = mock(CravesJwtService.class);
        var generator = mock(RefreshTokenGenerator.class);
        var admin = mock(AdminSessionService.class);
        var hash = new TokenHasher();
        var identity = new AuthIdentity("synthetic-staff", "+10000000000");
        UUID id = UUID.randomUUID(); ReflectionTestUtils.setField(identity, "id", id);
        identity.setStatus("ACTIVE");
        var old = new RefreshSession(id, hash.sha256Base64Url("synthetic-old"), "mobile", null, Instant.now().plusSeconds(86400));
        when(refreshes.findByRefreshTokenHash(old.getRefreshTokenHash())).thenReturn(Optional.of(old));
        when(refreshes.save(any())).thenAnswer(i -> i.getArgument(0));
        when(identities.findById(id)).thenReturn(Optional.of(identity));
        when(roles.findRoleCodesByIdentityId(id)).thenReturn(List.of("CUSTOMER", "CHEF", "PLATFORM_ADMIN"));
        when(generator.generate()).thenReturn("synthetic-replacement");
        when(jwt.issueAccessToken(identity, List.of("CUSTOMER", "CHEF"))).thenReturn("synthetic-access");
        var service = new AuthService(null, new JwtProperties(), identities, mock(AuthRoleRepository.class), roles,
            refreshes, mock(LoginAttemptRepository.class), mock(AuthAuditRepository.class), jwt, generator, hash, admin);
        Instant before = Instant.now();
        var response = service.refresh("synthetic-old", null, new MockHttpServletRequest());
        assertEquals(900, response.expiresIn());
        assertTrue(response.refreshTokenExpiresAt().isAfter(before.plusSeconds(30L * 86400 - 1)));
        assertTrue(response.refreshTokenExpiresAt().isBefore(Instant.now().plusSeconds(30L * 86400 + 1)));
        assertEquals(List.of("CUSTOMER", "CHEF"), response.identity().roles());
        assertEquals("ROTATED", old.getRevokeReason());
        assertEquals(List.of("CUSTOMER", "CHEF"), service.me(new CurrentUser(id, "synthetic-staff", "+10000000000", List.of("CUSTOMER", "CHEF"), 0)).roles());
        verify(admin, never()).refresh(anyString(), any());
    }
}
