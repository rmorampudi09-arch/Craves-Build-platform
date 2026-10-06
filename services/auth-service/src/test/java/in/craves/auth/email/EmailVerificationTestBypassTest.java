package in.craves.auth.email;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.exception.AuthException;
import in.craves.auth.security.CurrentUser;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class EmailVerificationTestBypassTest {
    static final Instant NOW = Instant.parse("2026-10-06T10:00:00Z");
    static final String CODE = "112233"; // Synthetic fixture, never the live test code.
    static String phone(int i) { return "+91" + (9000000000L + i); }
    static String email(int i) { return "test+" + i + "@example.test"; }
    static CurrentUser user(int i) {
        return new CurrentUser(UUID.randomUUID(), "synthetic", phone(i), List.of("CUSTOMER"), 1);
    }
    static String phones() throws Exception {
        var labels = new LinkedHashMap<String,String>();
        for (int i=1;i<=210;i++) labels.put(phone(i), "CHEF-E2E-" + String.format("%03d",i));
        return new ObjectMapper().writeValueAsString(labels);
    }
    static String pairs() throws Exception {
        return new ObjectMapper().writeValueAsString(Map.of(email(1),phone(1),email(2),phone(2),email(3),phone(3)));
    }
    static EmailVerificationTestBypass policy(boolean enabled, boolean phoneEnabled, Instant now, Instant expiry) throws Exception {
        return new EmailVerificationTestBypass(enabled,pairs(),phoneEnabled,phones(),CODE,expiry.toString(),
            Clock.fixed(now,ZoneOffset.UTC));
    }
    @ParameterizedTest @ValueSource(ints={1,2,3})
    void matchingPairGetsOnlyTheSyntheticCodeWithoutGrantingRoles(int i) throws Exception {
        var actor=user(i); var p=policy(true,true,NOW,NOW.plusSeconds(600));
        assertEquals(CODE,p.codeFor(actor,email(i))); assertEquals(List.of("CUSTOMER"),actor.roles());
    }
    @ParameterizedTest @ValueSource(ints={0,4,210})
    void anotherPhoneCannotUseAConfiguredEmail(int i) throws Exception {
        var p=policy(true,true,NOW,NOW.plusSeconds(600));
        assertEquals("EMAIL_TEST_NOT_AVAILABLE",assertThrows(AuthException.class,()->p.codeFor(user(i),email(1))).getCode());
    }
    @Test void realEmailUsesNormalTransportEvenForAnAllowlistedPhone() throws Exception {
        assertNull(policy(true,true,NOW,NOW.plusSeconds(600)).codeFor(user(1),"real@example.test"));
    }
    @Test void nullAndUnconfiguredEmailDoNotActivateBypass() throws Exception {
        var p=policy(true,true,NOW,NOW.plusSeconds(600));
        assertNull(p.codeFor(user(1),null)); assertNull(p.codeFor(user(1),email(4)));
    }
    @Test void nullActorCannotVerifyTheConfiguredEmail() throws Exception {
        assertThrows(AuthException.class,()->policy(true,true,NOW,NOW.plusSeconds(600)).codeFor(null,email(1)));
    }
    @Test void emailFlagOffFailsClosedForConfiguredAddresses() throws Exception {
        assertThrows(AuthException.class,()->policy(false,true,NOW,NOW.plusSeconds(600)).codeFor(user(1),email(1)));
    }
    @Test void phoneFlagOffAlsoDisablesEmailBypass() throws Exception {
        assertThrows(AuthException.class,()->policy(true,false,NOW,NOW.plusSeconds(600)).codeFor(user(1),email(1)));
    }
    @Test void exactExpiryBoundaryFailsClosed() throws Exception {
        assertThrows(AuthException.class,()->policy(true,true,NOW,NOW).codeFor(user(1),email(1)));
    }
    @Test void challengeCannotUseTestCodeAfterBypassExpiry() throws Exception {
        assertThrows(AuthException.class,()->policy(true,true,NOW.plusSeconds(601),NOW.plusSeconds(600)).codeFor(user(1),email(1)));
    }
    @Test void configurationCannotExtendBeyondOneDay() {
        assertThrows(IllegalArgumentException.class,()->policy(true,true,NOW,NOW.plusSeconds(86401)));
    }
    @Test void ordinaryDisabledConstructorDoesNotAffectRealEmail() {
        assertNull(EmailVerificationTestBypass.disabled(Clock.fixed(NOW,ZoneOffset.UTC)).codeFor(user(1),email(1)));
    }
    @Test void malformedConfigurationDoesNotLeakValuesInError() {
        String sensitive="not-json-private-input";
        var error=assertThrows(IllegalArgumentException.class,()->new EmailVerificationTestBypass(true,sensitive,true,"",CODE,
            NOW.plusSeconds(600).toString(),Clock.fixed(NOW,ZoneOffset.UTC)));
        assertFalse(error.toString().contains(sensitive)); assertFalse(error.toString().contains(CODE));
    }
    @Test void partialAndOversizedAllowlistCannotActivate() throws Exception {
        for (var map:List.of(Map.of(email(1),phone(1)),
            Map.of(email(1),phone(1),email(2),phone(2),email(3),phone(3),email(4),phone(4)))) {
            String json=new ObjectMapper().writeValueAsString(map);
            assertThrows(IllegalArgumentException.class,()->new EmailVerificationTestBypass(true,json,true,phones(),CODE,
                NOW.plusSeconds(600).toString(),Clock.fixed(NOW,ZoneOffset.UTC)));
        }
    }
    @Test void emailPairMustReferToAnExistingApprovedTestRegistryPhone() throws Exception {
        String json=new ObjectMapper().writeValueAsString(Map.of(email(1),phone(211),email(2),phone(2),email(3),phone(3)));
        assertThrows(IllegalArgumentException.class,()->new EmailVerificationTestBypass(true,json,true,phones(),CODE,
            NOW.plusSeconds(600).toString(),Clock.fixed(NOW,ZoneOffset.UTC)));
    }
    @Test void aliasesCannotAllPointAtOneAccount() throws Exception {
        String json=new ObjectMapper().writeValueAsString(Map.of(email(1),phone(1),email(2),phone(1),email(3),phone(3)));
        assertThrows(IllegalArgumentException.class,()->new EmailVerificationTestBypass(true,json,true,phones(),CODE,
            NOW.plusSeconds(600).toString(),Clock.fixed(NOW,ZoneOffset.UTC)));
    }
    @Test void caseVariantStillBindsToTheSameOwner() throws Exception {
        assertEquals(CODE,policy(true,true,NOW,NOW.plusSeconds(600)).codeFor(user(1),email(1).toUpperCase()));
    }
}
