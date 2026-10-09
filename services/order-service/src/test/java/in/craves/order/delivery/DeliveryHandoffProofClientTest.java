package in.craves.order.delivery;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsServer;
import in.craves.order.delivery.DeliveryStatusModels.*;
import in.craves.order.delivery.DeliveryStatusUpdateService.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;

class DeliveryHandoffProofClientTest {
    static SSLContext testTls;
    static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules()
        .enable(com.fasterxml.jackson.databind.DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
        .enable(com.fasterxml.jackson.databind.DeserializationFeature.USE_BIG_INTEGER_FOR_INTS);
    static final String KEY = "OFFLINE_SYNTHETIC_SERVICE_KEY";
    HttpsServer server;
    java.util.concurrent.ExecutorService workers;
    DeliveryHandoffProofClient client;
    String origin;
    EventEnvelope<DeliveryStatusChangedData> event;
    String raw;
    volatile int code = 200;
    volatile String type = "application/json", body;
    volatile boolean stallHeaders, stallBody;
    CountDownLatch release = new CountDownLatch(1);
    AtomicInteger calls = new AtomicInteger(), leaked = new AtomicInteger();

    @BeforeAll static void certificate() throws Exception {
        Path dir = Files.createTempDirectory("of02-test-tls-");
        Path store = dir.resolve("test.p12");
        Process keytool = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "keytool").toString(),
            "-genkeypair", "-alias", "offline-test", "-keyalg", "RSA", "-keysize", "2048",
            "-validity", "1", "-dname", "CN=localhost", "-ext", "SAN=dns:localhost,ip:127.0.0.1",
            "-storetype", "PKCS12", "-keystore", store.toString(), "-storepass", "offline-test-only",
            "-keypass", "offline-test-only", "-noprompt").redirectErrorStream(true).start();
        String output = new String(keytool.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertEquals(0, keytool.waitFor(), output);
        KeyStore keys = KeyStore.getInstance("PKCS12");
        try (var in = Files.newInputStream(store)) { keys.load(in, "offline-test-only".toCharArray()); }
        KeyManagerFactory km = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        km.init(keys, "offline-test-only".toCharArray());
        TrustManagerFactory tm = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tm.init(keys);
        testTls = SSLContext.getInstance("TLS");
        testTls.init(km.getKeyManagers(), tm.getTrustManagers(), null);
        Files.delete(store); Files.delete(dir);
    }

    @BeforeEach void setup() throws Exception {
        UUID job = UUID.randomUUID(), checkout = UUID.randomUUID();
        event = new EventEnvelope<>(UUID.randomUUID(), "DELIVERY_STATUS_CHANGED", "1.0", Instant.now(),
            checkout, null, "integration-service", "delivery-job/" + job,
            new DeliveryStatusChangedData(job, checkout, UUID.randomUUID(), "pidge", "pidge-offline", "SEARCHING",
                null, Instant.now(), "borzo", "borzo-offline", null));
        raw = JSON.writeValueAsString(event);
        body = proof("COMPLETED").toString();
        server = HttpsServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setHttpsConfigurator(new HttpsConfigurator(testTls));
        workers = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor();
        server.setExecutor(workers);
        server.createContext("/", exchange -> {
            if (exchange.getRequestURI().getPath().equals("/credential-leak")) leaked.incrementAndGet();
            calls.incrementAndGet();
            assertEquals(KEY, exchange.getRequestHeaders().getFirst("X-Craves-Internal-Secret"));
            try {
                if (stallHeaders) release.await(30, TimeUnit.SECONDS);
                exchange.getResponseHeaders().add("Content-Type", type);
                if (code == 302) exchange.getResponseHeaders().add("Location", origin + "/credential-leak");
                exchange.sendResponseHeaders(code, 0);
                exchange.getResponseBody().write((stallBody ? "{" : body).getBytes(StandardCharsets.UTF_8));
                exchange.getResponseBody().flush();
                if (stallBody) release.await(30, TimeUnit.SECONDS);
            } catch (Exception ignored) {
                // Expected client disconnect for bounded timeout tests.
            } finally { exchange.close(); }
        });
        server.start(); origin = "https://localhost:" + server.getAddress().getPort();
        // Only this in-process test certificate is trusted by the constructed client; restore immediately.
        SSLContext previous = SSLContext.getDefault();
        try { SSLContext.setDefault(testTls); client = new DeliveryHandoffProofClient(RestClient.builder(), JSON, origin, KEY); }
        finally { SSLContext.setDefault(previous); }
    }

    @AfterEach void close() {
        release.countDown();
        if (server != null) server.stop(0);
        if (workers != null) workers.close();
    }

    ObjectNode proof(String state) throws Exception {
        ObjectNode p = JSON.createObjectNode().put("proofVersion", "1.0")
            .put("deliveryJobId", event.data().deliveryJobId().toString())
            .put("eventId", event.eventId().toString()).put("state", state);
        if (state.equals("COMPLETED")) p.set("event", JSON.readTree(raw));
        else p.putNull("event");
        return p;
    }
    void unavailable() {
        assertEquals("Delivery handoff proof is temporarily unavailable",
            assertThrows(DeliveryStatusRetryableException.class, () -> client.verify(event, raw)).getMessage());
    }

    @Test void readsExactCommittedEventOverAuthenticatedHttps() {
        assertDoesNotThrow(() -> client.verify(event, raw)); assertEquals(1, calls.get());
    }
    @Test void rejectsAuthoritativeNegativeWithoutTrustingProvenanceFields() throws Exception {
        body = proof("NOT_CONFIRMED").toString();
        assertEquals("Delivery handoff does not match committed evidence",
            assertThrows(DeliveryStatusNonRetryableException.class, () -> client.verify(event, raw)).getMessage());
    }
    @Test void rejectsChangedPersistedPayload() throws Exception {
        ObjectNode p = proof("COMPLETED"); ((ObjectNode)p.path("event").path("data")).put("status", "DELIVERED");
        body = p.toString();
        assertEquals("Delivery handoff does not match committed evidence",
            assertThrows(DeliveryStatusNonRetryableException.class, () -> client.verify(event, raw)).getMessage());
    }
    @Test void rejectsSubDoublePrecisionTimestampMutation() throws Exception {
        ObjectNode p = proof("COMPLETED");
        ((ObjectNode)p.path("event").path("data")).put("observedAt", new java.math.BigDecimal("1791520000.000000001"));
        body = p.toString();
        String changed = body.replace("1791520000.000000001", "1791520000.000000002");
        String changedEvent = JSON.readTree(changed).path("event").toString();
        assertThrows(DeliveryStatusNonRetryableException.class, () -> client.verify(event, changedEvent));
    }
    @Test void duplicateJsonKeysAreRetryableMalformedEvidence() {
        body = body.replace("\"proofVersion\":\"1.0\"", "\"proofVersion\":\"2.0\",\"proofVersion\":\"1.0\""); unavailable();
    }
    @ParameterizedTest @ValueSource(strings={"", "http://localhost", "https://user@localhost", "https://localhost/path", "https://localhost?x=1", "https://localhost#x", "invalid", "https:///"})
    void refusesUntrustedOriginBeforeSendingCredential(String bad) {
        client = new DeliveryHandoffProofClient(RestClient.builder(), JSON, bad, KEY); unavailable(); assertEquals(0, calls.get());
    }
    @Test void missingKeyFailsBeforeAnyRequest() {
        client = new DeliveryHandoffProofClient(RestClient.builder(), JSON, origin, ""); unavailable(); assertEquals(0, calls.get());
    }
    @ParameterizedTest @ValueSource(ints={301,302,307,308,401,403,404,429,500,503})
    void retriesNonSuccessAndNeverFollowsRedirects(int status) {
        code = status; unavailable(); assertEquals(1, calls.get()); assertEquals(0, leaked.get());
    }
    @ParameterizedTest @ValueSource(strings={"malformed","empty","oversized","wrongType","wrongVersion","wrongJob","wrongEvent","unknownState","missingEvent","negativeWithEvent"})
    void retriesMalformedOrMismatchedProof(String mutation) throws Exception {
        ObjectNode p = proof("COMPLETED");
        switch(mutation) {
            case "malformed" -> body = "{";
            case "empty" -> body = "";
            case "oversized" -> body = "x".repeat(65_537);
            case "wrongType" -> type = "text/html";
            case "wrongVersion" -> p.put("proofVersion", "2.0");
            case "wrongJob" -> p.put("deliveryJobId", UUID.randomUUID().toString());
            case "wrongEvent" -> p.put("eventId", UUID.randomUUID().toString());
            case "unknownState" -> p.put("state", "PENDING");
            case "missingEvent" -> p.remove("event");
            case "negativeWithEvent" -> p.put("state", "NOT_CONFIRMED");
            default -> throw new AssertionError();
        }
        if (!java.util.Set.of("malformed", "empty", "oversized", "wrongType").contains(mutation)) body = p.toString();
        unavailable();
    }
    @Test @Timeout(20) void headerStallHasBoundedTimeout() {
        stallHeaders = true; long start = System.nanoTime(); unavailable();
        assertTrue(DurationSeconds.since(start) < 16);
    }
    @Test @Timeout(20) void partialBodyStallHasBoundedTimeout() {
        stallBody = true; long start = System.nanoTime(); unavailable();
        assertTrue(DurationSeconds.since(start) < 16);
    }
    static final class DurationSeconds { static double since(long start) { return (System.nanoTime() - start) / 1_000_000_000d; } }
}
