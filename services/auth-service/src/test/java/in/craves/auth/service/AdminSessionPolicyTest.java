package in.craves.auth.service;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.exception.AuthException;
import in.craves.auth.security.CravesJwtService;
import in.craves.auth.security.RsaKeyProvider;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class AdminSessionPolicyTest {
    @Test void originalAuthenticationBoundsTheWholeSession() {
        Instant start = Instant.parse("2026-09-12T10:00:00Z");
        assertEquals(start.plusSeconds(28800), AdminSessionService.deadline(start.getEpochSecond(), start));
        assertEquals(start.plusSeconds(28800), AdminSessionService.deadline(start.getEpochSecond(), start.plusSeconds(28799)));
        assertThrows(AuthException.class, () -> AdminSessionService.deadline(start.getEpochSecond(), start.plusSeconds(28800)));
        assertThrows(AuthException.class, () -> AdminSessionService.deadline(start.getEpochSecond(), start.plusSeconds(28801)));
        assertThrows(AuthException.class, () -> AdminSessionService.deadline(null, start));
        assertThrows(AuthException.class, () -> AdminSessionService.deadline(start.plusSeconds(60).getEpochSecond(), start));
    }

    @Test void customerChefAndLegacyMarkerDoNotBecomeInternalAdministrators() {
        assertFalse(AdminSessionService.isAdmin(List.of("CUSTOMER", "CHEF", "ADMIN")));
        for (String role : in.craves.auth.admin.InternalAdminRoles.codes()) assertTrue(AdminSessionService.isAdmin(List.of("CUSTOMER", role)));
    }

    @Test void realSignedAccessTokensStayShortAndRejectExpiryAndBadSignatures() {
        Instant start = Instant.parse("2026-09-12T10:00:00Z");
        JwtProperties properties = new JwtProperties(); properties.setAllowGeneratedLocalKeys(true);
        RsaKeyProvider keys = new RsaKeyProvider(properties);
        AuthIdentity identity = new AuthIdentity("synthetic-firebase", "+10000000000");
        ReflectionTestUtils.setField(identity, "id", UUID.randomUUID());
        CravesJwtService jwt = new CravesJwtService(properties, keys, new ObjectMapper(), Clock.fixed(start, ZoneOffset.UTC));
        String customer = jwt.issueAccessToken(identity, List.of("CUSTOMER"));
        assertEquals(start.plusSeconds(900), jwt.verifyAccessToken(customer).expiresAt());
        UUID family = UUID.randomUUID();
        String admin = jwt.issueAccessToken(identity, List.of("PLATFORM_ADMIN"), start.plusSeconds(1), family, start.minusSeconds(28799));
        assertEquals(family, jwt.verifyAccessToken(admin).adminSessionId());
        CravesJwtService expired = new CravesJwtService(properties, keys, new ObjectMapper(), Clock.fixed(start.plusSeconds(1), ZoneOffset.UTC));
        assertThrows(AuthException.class, () -> expired.verifyAccessToken(admin));
        String[] parts = admin.split("\\.");
        String tampered = parts[0] + "." + parts[1] + "." + (parts[2].startsWith("A") ? "B" : "A") + parts[2].substring(1);
        assertThrows(AuthException.class, () -> jwt.verifyAccessToken(tampered));
    }

    @Test void consumerAndMobileCredentialsKeepTheirPolicyWithoutPrivilegedRoles() {
        List<String> allRoles = new java.util.ArrayList<>(in.craves.auth.admin.InternalAdminRoles.codes());
        allRoles.addAll(List.of("CUSTOMER", "CHEF"));
        assertEquals(List.of("CUSTOMER", "CHEF"), AdminSessionService.consumerRoles(allRoles));
        JwtProperties properties = new JwtProperties();
        assertEquals(java.time.Duration.ofDays(30), properties.getRefreshTokenTtl());
        assertEquals(java.time.Duration.ofMinutes(15), properties.getAccessTokenTtl());
        assertEquals(List.of("CUSTOMER", "CHEF"), AdminSessionService.consumerRoles(List.of("CUSTOMER", "CHEF")));
    }
}
