package in.craves.auth.deletion;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpServer;
import in.craves.auth.deletion.AccountErasureClient.Outcome;
import in.craves.auth.deletion.AccountErasureClient.ServiceCall;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.referrals.transport.SourceSignatures;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AccountErasureClientTest {
    record Seen(String path, String query, Headers headers, byte[] body) {}
    record Reply(int status, String body) {}

    static final String SECRET = "X-Craves-Internal-Secret";
    static final String KEY = "X-Craves-Internal-Key";
    static final byte[] HMAC_KEY = "referral-hmac-key-for-tests-32-bytes!!".getBytes(StandardCharsets.UTF_8);
    static final String OK = "{\"service\":\"x\",\"status\":\"DONE\",\"counts\":{\"rows\":2,\"files\":3}}";

    final Clock clock = Clock.fixed(Instant.parse("2026-11-04T10:00:00Z"), ZoneOffset.UTC);
    final ObjectMapper mapper = new ObjectMapper();
    final LinkedBlockingQueue<Seen> seen = new LinkedBlockingQueue<>();
    final CountDownLatch stalled = new CountDownLatch(1);
    final ExecutorService handlers = Executors.newCachedThreadPool();
    final UUID requestId = UUID.randomUUID();
    final UUID identityId = UUID.randomUUID();
    volatile Reply reply = new Reply(200, OK);
    HttpServer server;

    @BeforeEach void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(handlers);
        server.createContext("/", exchange -> {
            seen.add(new Seen(exchange.getRequestURI().getPath(), exchange.getRequestURI().getRawQuery(),
                exchange.getRequestHeaders(), exchange.getRequestBody().readAllBytes()));
            Reply current = reply;
            if (current == null) { try { stalled.await(30, TimeUnit.SECONDS); } catch (InterruptedException ignored) { } }
            else {
                byte[] bytes = current.body().getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(current.status(), bytes.length);
                exchange.getResponseBody().write(bytes);
            }
            exchange.close();
        });
        server.start();
    }

    @AfterEach void stop() {
        stalled.countDown();
        server.stop(0);
        handlers.shutdownNow();
    }

    AccountDeletionProperties props(String base, Duration callTimeout) {
        var props = new AccountDeletionProperties();
        props.setEnabled(true);
        props.setCallTimeout(callTimeout);
        Map<String, AccountDeletionProperties.Service> services = new LinkedHashMap<>();
        for (String name : AccountErasureClient.ERASE_ORDER) {
            var service = new AccountDeletionProperties.Service();
            service.setBaseUrl(base);
            service.setCredential("credential-of-" + name);
            services.put(name, service);
        }
        props.setServices(services);
        props.setReferralHmacKeyBase64(Base64.getEncoder().encodeToString(HMAC_KEY));
        props.validate();
        return props;
    }

    AccountErasureClient client() { return client(Duration.ofSeconds(5)); }

    AccountErasureClient client(Duration callTimeout) {
        return new AccountErasureClient(props("http://127.0.0.1:" + server.getAddress().getPort(), callTimeout), clock);
    }

    Seen lastSeen() throws Exception { return seen.poll(5, TimeUnit.SECONDS); }

    @Test void eachServiceGetsItsOwnHeaderAndCredential() throws Exception {
        Map<String, String> header = Map.of("subscription", SECRET, "order", SECRET, "integration", SECRET,
            "advanced", SECRET, "user-chef", SECRET, "notification", KEY, "catalog", KEY);
        var client = client();
        for (var entry : header.entrySet()) {
            assertEquals(Outcome.DONE, client.blockers(entry.getKey(), identityId, Scope.CHEF).outcome());
            Headers headers = lastSeen().headers();
            assertEquals("credential-of-" + entry.getKey(), headers.getFirst(entry.getValue()), entry.getKey());
            assertNull(headers.getFirst(entry.getValue().equals(SECRET) ? KEY : SECRET), entry.getKey());
            assertNull(headers.getFirst("Authorization"), entry.getKey());
            assertNull(headers.getFirst("X-Referral-Source"), entry.getKey());
            assertEquals("application/json", headers.getFirst("Content-Type"), entry.getKey());
            assertEquals("application/json", headers.getFirst("Accept"), entry.getKey());
        }
        client.blockers("referral", identityId, Scope.CHEF);
        Headers referral = lastSeen().headers();
        assertNull(referral.getFirst(SECRET));
        assertNull(referral.getFirst(KEY));
        assertNull(referral.getFirst("Authorization"));
    }

    @Test void eachCallUsesItsPathAndSendsExactlyTheThreeFields() throws Exception {
        var client = client();
        client.blockers("order", identityId, Scope.ALL);
        Seen blockers = lastSeen();
        assertEquals("/internal/v1/account-erasure/blockers", blockers.path());
        assertNull(blockers.query());
        client.prepare("order", requestId, identityId, Scope.CUSTOMER);
        client.release("order", requestId, identityId, Scope.CUSTOMER);
        client.erase("order", requestId, identityId, Scope.CUSTOMER);
        Map<String, Seen> bySuffix = new LinkedHashMap<>();
        for (int i = 0; i < 3; i++) { Seen s = lastSeen(); bySuffix.put(s.path(), s); }
        assertEquals(Set.of("/internal/v1/account-erasure/prepare", "/internal/v1/account-erasure/release",
            "/internal/v1/account-erasure"), bySuffix.keySet());
        for (Seen s : bySuffix.values()) {
            JsonNode body = mapper.readTree(s.body());
            assertEquals(List.of("requestId", "identityId", "scope").stream().sorted().toList(),
                fieldNames(body).stream().sorted().toList());
            assertEquals(requestId.toString(), body.get("requestId").asText());
            assertEquals(identityId.toString(), body.get("identityId").asText());
            assertEquals("CUSTOMER", body.get("scope").asText());
        }
        JsonNode first = mapper.readTree(blockers.body());
        assertDoesNotThrow(() -> UUID.fromString(first.get("requestId").asText()));
    }

    @Test void referralCallsAreSignedLikeTheSourceClient() throws Exception {
        var client = client();
        client.prepare("referral", requestId, identityId, Scope.ALL);
        client.erase("referral", requestId, identityId, Scope.ALL);
        String timestamp = Long.toString(clock.instant().getEpochSecond());
        for (int i = 0; i < 2; i++) {
            Seen s = lastSeen();
            Headers h = s.headers();
            assertNull(s.query());
            assertNull(h.getFirst("Authorization"));
            assertEquals("auth", h.getFirst("X-Referral-Source"));
            assertEquals("current", h.getFirst("X-Referral-Key-Id"));
            assertEquals(timestamp, h.getFirst("X-Referral-Timestamp"));
            assertEquals(SourceSignatures.sign(HMAC_KEY, "auth", "current", timestamp, "POST", s.path(), s.body()),
                h.getFirst("X-Referral-Signature"));
            assertEquals("application/json", h.getFirst("Content-Type"));
            assertEquals("application/json", h.getFirst("Accept"));
        }
    }

    @Test void twoHundredIsDoneWithCounts() {
        ServiceCall call = client().erase("order", requestId, identityId, Scope.CUSTOMER);
        assertEquals(Outcome.DONE, call.outcome());
        assertEquals(Map.of("rows", 2, "files", 3), call.counts());
        assertEquals(5, call.erasedCount());
        assertTrue(call.blockers().isEmpty());
        assertNull(call.error());
    }

    @Test void blockersAnswerListsTheServicesBlockersTaggedWithTheService() {
        reply = new Reply(200, "{\"service\":\"order\",\"blockers\":[{\"code\":\"OPEN_ORDERS\",\"detail\":\"2 orders\"}]}");
        ServiceCall call = client().blockers("order", identityId, Scope.CHEF);
        assertEquals(Outcome.DONE, call.outcome());
        assertEquals(List.of(new AccountErasureClient.Blocker("order", "OPEN_ORDERS", "2 orders")), call.blockers());
    }

    @Test void conflictIsBlockedOnlyWithStatusBlocked() {
        reply = new Reply(409, "{\"service\":\"order\",\"status\":\"BLOCKED\",\"blockers\":"
            + "[{\"code\":\"OPEN_ORDERS\",\"detail\":\"2 orders\"},{\"code\":\"HELD_PAYOUT\",\"detail\":\"held\"}]}");
        ServiceCall blocked = client().erase("order", requestId, identityId, Scope.CHEF);
        assertEquals(Outcome.BLOCKED, blocked.outcome());
        assertEquals(List.of(new AccountErasureClient.Blocker("order", "OPEN_ORDERS", "2 orders"),
            new AccountErasureClient.Blocker("order", "HELD_PAYOUT", "held")), blocked.blockers());
        assertNull(blocked.error());

        reply = new Reply(409, "{\"code\":\"CONFLICT\",\"message\":\"plan changed\"}");
        ServiceCall apiError = client().erase("subscription", requestId, identityId, Scope.CHEF);
        assertEquals(Outcome.FAILED, apiError.outcome());
        assertEquals("HTTP 409", apiError.error());
        assertTrue(apiError.blockers().isEmpty());
    }

    @Test void otherStatusesTimeoutsAndBadJsonFail() {
        for (int status : new int[] {401, 403, 500, 503}) {
            reply = new Reply(status, "secret-body-text 9876543210");
            ServiceCall call = client().prepare("catalog", requestId, identityId, Scope.CHEF);
            assertEquals(Outcome.FAILED, call.outcome());
            assertEquals("HTTP " + status, call.error());
        }
        reply = new Reply(200, "not json");
        ServiceCall bad = client().prepare("catalog", requestId, identityId, Scope.CHEF);
        assertEquals(Outcome.FAILED, bad.outcome());
        assertEquals("BAD_BODY", bad.error());

        reply = null;
        ServiceCall stalledCall = client(Duration.ofSeconds(1)).prepare("catalog", requestId, identityId, Scope.CHEF);
        assertEquals(Outcome.FAILED, stalledCall.outcome());
        assertEquals("TIMEOUT", stalledCall.error());
    }

    @Test void unreachableAndUnconfiguredServicesFail() throws Exception {
        int closedPort;
        try (var socket = new ServerSocket(0, 0, InetAddress.getLoopbackAddress())) { closedPort = socket.getLocalPort(); }
        var down = new AccountErasureClient(props("http://127.0.0.1:" + closedPort, Duration.ofSeconds(5)), clock);
        assertEquals("UNREACHABLE", down.prepare("order", requestId, identityId, Scope.CHEF).error());
        assertEquals("NOT_CONFIGURED", client().prepare("nobody", requestId, identityId, Scope.CHEF).error());
        var blank = new AccountErasureClient(new AccountDeletionProperties(), clock);
        assertEquals(Outcome.FAILED, blank.blockers("referral", identityId, Scope.CHEF).outcome());
        assertEquals("NOT_CONFIGURED", blank.erase("order", requestId, identityId, Scope.CHEF).error());
    }

    static List<String> fieldNames(JsonNode node) {
        var names = new java.util.ArrayList<String>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }
}
