package in.craves.referral;

import in.craves.referral.client.ReferralSourceClient;
import in.craves.referral.client.ReferralSourceClient.Endpoint;
import in.craves.referral.security.SourceSignatures;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ReferralSourceClientTest {
    private final Clock clock=Clock.fixed(Instant.parse("2026-09-15T00:00:00Z"),ZoneOffset.UTC);
    private final byte[] key="DISPOSABLE_SOURCE_CLIENT_TEST_KEY_ONLY".getBytes(StandardCharsets.UTF_8);
    private ReferralSourceClient client(String source) { return new ReferralSourceClient(URI.create("https://referral.internal.example"),source,"current",key,clock); }
    @Test void requestBindsSourceTimestampExactPathAndBytesWithoutBearerOrRedirect() {
        byte[] bytes="{\"eventId\":\"synthetic-only\"}".getBytes(StandardCharsets.UTF_8);
        var request=client("order").prepare(Endpoint.EVENTS,bytes);
        assertEquals("https://referral.internal.example/internal/v1/referrals/events",request.uri().toString());
        assertFalse(request.headers().containsKey("Authorization")); assertEquals("order",request.headers().get("X-Referral-Source"));
        SourceSignatures.verify(key,"order","current",request.headers().get("X-Referral-Timestamp"),"POST",Endpoint.EVENTS.path(),request.body(),request.headers().get("X-Referral-Signature"),clock);
        assertThrows(ReferralProblem.class,()->SourceSignatures.verify(key,"finance","current",request.headers().get("X-Referral-Timestamp"),"POST",Endpoint.EVENTS.path(),request.body(),request.headers().get("X-Referral-Signature"),clock));
        bytes[0]='x'; assertEquals('{',request.body()[0]); byte[] returned=request.body(); returned[0]='y'; assertEquals('{',request.body()[0]);
    }
    @Test void rejectsUnapprovedOriginWeakKeysOversizedBodiesAndNonFinanceClaims() {
        for(String value:new String[]{"http://referral.internal.example","https://user:secret@referral.internal.example","https://referral.internal.example/path","https://referral.internal.example/?next=other"})
            assertThrows(IllegalArgumentException.class,()->new ReferralSourceClient(URI.create(value),"auth","current",key,clock));
        assertThrows(IllegalArgumentException.class,()->new ReferralSourceClient(URI.create("https://example.test"),"auth","current",new byte[16],clock));
        assertThrows(IllegalArgumentException.class,()->client("auth").prepare(Endpoint.EVENTS,new byte[131073]));
        assertThrows(IllegalArgumentException.class,()->client("order").prepare(Endpoint.CLAIM,"{}".getBytes(StandardCharsets.UTF_8)));
    }
    @Test void doesNotConfuseReceiptWithPaymentCompletion() {
        assertTrue(new ReferralSourceClient.Reply(202,new byte[0]).acknowledgedByEndpoint());
        assertFalse(new ReferralSourceClient.Reply(302,new byte[0]).acknowledgedByEndpoint());
        assertTrue(new ReferralSourceClient.Reply(503,new byte[0]).requiresReconciliation());
    }
}
