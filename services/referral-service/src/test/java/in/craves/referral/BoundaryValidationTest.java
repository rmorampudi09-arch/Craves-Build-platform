package in.craves.referral;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import in.craves.referral.infra.Json;
import in.craves.referral.security.ReferralJwtDecoder;
import in.craves.referral.security.ReferralRevocationFilter;
import in.craves.referral.security.SourceSignatures;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.JwtException;
import static org.junit.jupiter.api.Assertions.*;

class BoundaryValidationTest {
    static final Clock CLOCK=Clock.fixed(Instant.parse("2026-09-15T00:00:00Z"),ZoneOffset.UTC);
    static final String AUTH=encoded("DISPOSABLE_AUTH_KEY_BOUNDARY_TEST_ONLY");
    static final String ORDER=encoded("DISPOSABLE_ORDER_KEY_BOUNDARY_TEST_ONLY");
    static final String FINANCE=encoded("DISPOSABLE_FINANCE_KEY_BOUNDARY_TEST_ONLY");
    static String encoded(String value) { return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8)); }
    static ReferralSettings settings(String pem,String auth,String order,String finance,String previousAuth) {
        return new ReferralSettings(true,true,true,true,true,true,"https://craves.in","https://api.craves.in/auth","craves-api",pem,
            auth,order,finance,previousAuth,"","",1000,10000000,100000000,900);
    }
    static ReferralSettings settings() { return settings("",AUTH,ORDER,FINANCE,""); }
    @Test void rejectsMultipleJsonDocumentsAndTrailingGarbage() {
        for(String body:List.of("{}{}","{} true","{} []","{} garbage","[] {}","null false"))
            assertEquals("INVALID_JSON",assertThrows(ReferralProblem.class,()->Json.parse(body)).getMessage());
        assertEquals("ok",Json.parse(" {\"value\":\"ok\"} \n\t").get("value").asText());
    }
    @Test void rejectsDuplicateJsonKeysAndExcessiveDepth() {
        for(String body:List.of("{\"amount\":1,\"amount\":2}","{\"x\":{\"id\":1,\"id\":2}}","[".repeat(34)+"0"+"]".repeat(34)))
            assertThrows(ReferralProblem.class,()->Json.parse(body));
    }
    @Test void sourceKeysCannotBeSharedAcrossTrustDomainsIncludingRotation() {
        assertEquals(503,assertThrows(ReferralProblem.class,()->settings("",AUTH,AUTH,FINANCE,"").key("auth","current")).status());
        assertEquals("SOURCE_KEY_ISOLATION_REQUIRED",assertThrows(ReferralProblem.class,()->settings("",AUTH,ORDER,FINANCE,ORDER).key("order","current")).getMessage());
        assertArrayEquals(Base64.getDecoder().decode(AUTH),settings().key("auth","current"));
        assertArrayEquals(Base64.getDecoder().decode(AUTH),settings("",AUTH,ORDER,FINANCE,AUTH).key("auth","previous"));
    }
    @Test void sourceSignatureBindsTheExactBytesPathSourceAndTimestamp() {
        var s=settings(); byte[] key=s.key("order","current"), bytes="{\"amount\":\"1000\"}".getBytes(StandardCharsets.UTF_8);
        String at=Long.toString(CLOCK.instant().getEpochSecond()), path="/internal/v1/referrals/events";
        String signature=SourceSignatures.sign(key,"order","current",at,"POST",path,bytes);
        assertDoesNotThrow(()->SourceSignatures.verify(key,"order","current",at,"POST",path,bytes,signature,CLOCK));
        assertThrows(ReferralProblem.class,()->SourceSignatures.verify(key,"finance","current",at,"POST",path,bytes,signature,CLOCK));
        assertThrows(ReferralProblem.class,()->SourceSignatures.verify(key,"order","current",at,"POST",path+"/",bytes,signature,CLOCK));
        assertThrows(ReferralProblem.class,()->SourceSignatures.verify(key,"order","current",at,"POST",path,"{}".getBytes(StandardCharsets.UTF_8),signature,CLOCK));
        assertThrows(ReferralProblem.class,()->SourceSignatures.verify(key,"order","current",at,"POST",path,bytes,signature,Clock.offset(CLOCK,java.time.Duration.ofSeconds(301))));
    }
    @Test void missingRevocationStateRequiresExplicitTtlContractAndMalformedStateNeverPasses() {
        assertEquals(503,assertThrows(ReferralProblem.class,()->ReferralRevocationFilter.verifyProjection(null,1)).status());
        assertDoesNotThrow(()->ReferralRevocationFilter.verifyProjection(null,1,true));
        assertDoesNotThrow(()->ReferralRevocationFilter.verifyProjection("ACTIVE|2",2));
        assertEquals(401,assertThrows(ReferralProblem.class,()->ReferralRevocationFilter.verifyProjection("ACTIVE|2",1)).status());
        assertEquals(401,assertThrows(ReferralProblem.class,()->ReferralRevocationFilter.verifyProjection("SUSPENDED|2",999)).status());
        for(String value:List.of("","ACTIVE","ACTIVE|-1","ACTIVE|1|extra","UNKNOWN|1","ACTIVE|abc"))
            assertEquals(503,assertThrows(ReferralProblem.class,()->ReferralRevocationFilter.verifyProjection(value,1,true)).status());
    }
    @Test void realRsaDecoderRejectsForgedExpiredWrongAudienceAndShortenedSubjectTokens() throws Exception {
        KeyPair pair=keys(); var decoder=ReferralJwtDecoder.create(settings(pem(pair),AUTH,ORDER,FINANCE,""),CLOCK);
        JWTClaimsSet valid=claims(UUID.randomUUID().toString(),"craves-api",CLOCK.instant().plusSeconds(60));
        assertNotNull(decoder.decode(signed(pair,valid)));
        assertThrows(JwtException.class,()->decoder.decode(signed(keys(),valid)));
        for(JWTClaimsSet invalid:List.of(
            claims("1-1-1-1-1","craves-api",CLOCK.instant().plusSeconds(60)),
            claims(UUID.randomUUID().toString(),"not-craves",CLOCK.instant().plusSeconds(60)),
            claims(UUID.randomUUID().toString(),"craves-api",CLOCK.instant().minusSeconds(60)),
            new JWTClaimsSet.Builder(valid).claim("token_version",1.5).build(),
            new JWTClaimsSet.Builder(valid).claim("roles",List.of("ADMIN",1)).build()))
            assertThrows(JwtException.class,()->decoder.decode(signed(pair,invalid)));
    }
    static KeyPair keys() throws Exception { var generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);return generator.generateKeyPair(); }
    static String pem(KeyPair pair) { return encoded("-----BEGIN PUBLIC KEY-----\n"+Base64.getEncoder().encodeToString(pair.getPublic().getEncoded())+"\n-----END PUBLIC KEY-----"); }
    static JWTClaimsSet claims(String sub,String audience,Instant expiry) {
        return new JWTClaimsSet.Builder().issuer("https://api.craves.in/auth").subject(sub).audience(audience)
            .issueTime(Date.from(CLOCK.instant())).expirationTime(Date.from(expiry)).claim("token_version",1L).claim("roles",List.of("CUSTOMER")).build();
    }
    static String signed(KeyPair pair,JWTClaimsSet claims) throws Exception {
        SignedJWT jwt=new SignedJWT(new JWSHeader(JWSAlgorithm.RS256),claims);jwt.sign(new RSASSASigner((RSAPrivateKey)pair.getPrivate()));return jwt.serialize();
    }
}
