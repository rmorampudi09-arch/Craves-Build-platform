package in.craves.auth.email;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SignedEmailTransportTest {
    HttpServer server;
    SignedEmailTransport transport;
    final ObjectMapper mapper=new ObjectMapper().findAndRegisterModules();
    final String key="synthetic-notification-key-independent-32";
    final Clock clock=Clock.fixed(Instant.parse("2026-09-15T10:00:00Z"),ZoneOffset.UTC);
    @BeforeEach void setup() throws Exception {
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0); server.start();
        String origin="http://127.0.0.1:"+server.getAddress().getPort();
        transport=new SignedEmailTransport(new EmailVerificationSettings(true,"synthetic-auth-hmac-only-key-32bytes",key,origin,true,
            "synthetic-projection-key-independent-32",origin,true),mapper,clock);
    }
    @AfterEach void stop() {server.stop(0);}
    @Test void actualHttpRequestBindsCompleteBodyPathAndTimestampWithoutBrowserRecipientInput() {
        UUID challenge=UUID.randomUUID(),owner=UUID.randomUUID(); AtomicReference<String> signature=new AtomicReference<>(),body=new AtomicReference<>();
        AtomicReference<String> timestamp=new AtomicReference<>();
        server.createContext(SignedEmailTransport.NOTIFICATION_PATH,exchange->{
            body.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
            signature.set(exchange.getRequestHeaders().getFirst("X-Craves-Email-Signature"));
            timestamp.set(exchange.getRequestHeaders().getFirst("X-Craves-Email-Timestamp"));
            byte[] response=("{\"status\":\"ACCEPTED\",\"challengeId\":\""+challenge+"\"}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(202,response.length);exchange.getResponseBody().write(response);exchange.close();
        });
        assertEquals("ACCEPTED",transport.send(challenge,owner,"chef@example.test","032159",clock.instant().plusSeconds(600)));
        assertEquals(Long.toString(clock.instant().getEpochSecond()),timestamp.get());
        assertEquals(EmailVerificationCrypto.hmac(key,"POST\n"+SignedEmailTransport.NOTIFICATION_PATH+"\n"+timestamp.get()+"\n"+body.get()),signature.get());
        assertTrue(body.get().contains(challenge.toString()));assertTrue(body.get().contains(owner.toString()));
        assertTrue(body.get().contains("2026-09-15T10:10:00Z"));
    }
    @Test void refusesRedirectWithoutContactingAnotherOriginOrReplayingCode() {
        AtomicInteger redirected=new AtomicInteger();
        server.createContext(SignedEmailTransport.NOTIFICATION_PATH,exchange->{exchange.getResponseHeaders().set("Location","/redirected");exchange.sendResponseHeaders(302,-1);exchange.close();});
        server.createContext("/redirected",exchange->{redirected.incrementAndGet();exchange.sendResponseHeaders(200,-1);exchange.close();});
        assertEquals("UNKNOWN",transport.send(UUID.randomUUID(),UUID.randomUUID(),"chef@example.test","032159",clock.instant().plusSeconds(600)));
        assertEquals(0,redirected.get());
    }
    @Test void rejectsUncorrelatedAcknowledgementAndOversizeResponse() {
        server.createContext(SignedEmailTransport.NOTIFICATION_PATH,exchange->{
            byte[] response=("{\"status\":\"ACCEPTED\",\"challengeId\":\""+UUID.randomUUID()+"\"}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200,response.length);exchange.getResponseBody().write(response);exchange.close();
        });
        assertEquals("UNKNOWN",transport.send(UUID.randomUUID(),UUID.randomUUID(),"chef@example.test","032159",clock.instant().plusSeconds(600)));
        server.removeContext(SignedEmailTransport.NOTIFICATION_PATH);
        server.createContext(SignedEmailTransport.NOTIFICATION_PATH,exchange->{byte[] response=new byte[9000];exchange.sendResponseHeaders(200,response.length);exchange.getResponseBody().write(response);exchange.close();});
        assertEquals("UNKNOWN",transport.send(UUID.randomUUID(),UUID.randomUUID(),"chef@example.test","032159",clock.instant().plusSeconds(600)));
    }
    @Test void projectionAcknowledgementMustCoverSentRevision() {
        AtomicInteger revision=new AtomicInteger(1);
        server.createContext(SignedEmailTransport.PROJECTION_PATH,exchange->{
            byte[] response=("{\"status\":\"APPLIED\",\"emailRevision\":"+revision.get()+"}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200,response.length);exchange.getResponseBody().write(response);exchange.close();
        });
        assertFalse(transport.project(UUID.randomUUID(),UUID.randomUUID(),"chef@example.test",2,clock.instant()));
        revision.set(2);assertTrue(transport.project(UUID.randomUUID(),UUID.randomUUID(),"chef@example.test",2,clock.instant()));
    }
}
