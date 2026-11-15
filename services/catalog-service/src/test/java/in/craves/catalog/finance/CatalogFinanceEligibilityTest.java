package in.craves.catalog.finance;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.catalog.exception.ApiException;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Flow;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CatalogFinanceEligibilityTest {
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final String key = "catalog-read-test-key-not-production-12345";
    private final CatalogFinanceEligibility client = new CatalogFinanceEligibility("https://finance.invalid", key, json);
    private final UUID request = UUID.randomUUID();
    private final Instant now = Instant.now();
    private CatalogFinanceEligibility.Snapshot snapshot() {
        return new CatalogFinanceEligibility.Snapshot(request, now, true, UUID.randomUUID(), 1, "a".repeat(64), List.of(UUID.randomUUID()));
    }
    private CatalogFinanceEligibility.Snapshot verify(Object value) throws Exception {
        byte[] body = json.writeValueAsBytes(value);
        String timestamp = Long.toString(now.getEpochSecond());
        return client.verify(request, body, timestamp, CatalogEligibilityProtocol.sign(key, "RESPONSE", timestamp, body), now);
    }
    @Test void acceptsFreshCompleteSignedSnapshotAndEmptyAuthority() throws Exception {
        assertEquals(snapshot().requestId(), verify(snapshot()).requestId());
        var empty = new CatalogFinanceEligibility.Snapshot(request, now, true, null, 0, "b".repeat(64), List.of());
        assertTrue(verify(empty).chefs().isEmpty());
        assertEquals("{}", verify(empty).sqlArray());
    }
    @Test void rejectsForgedSignatureChangedBodyRequestAndStaleResponse() throws Exception {
        byte[] body = json.writeValueAsBytes(snapshot());
        String timestamp = Long.toString(now.getEpochSecond());
        String signature = CatalogEligibilityProtocol.sign(key, "RESPONSE", timestamp, body);
        assertThrows(ApiException.class, () -> client.verify(request, body, timestamp, "f".repeat(64), now));
        assertThrows(ApiException.class, () -> client.verify(UUID.randomUUID(), body, timestamp, signature, now));
        assertThrows(ApiException.class, () -> client.verify(request, body, timestamp, signature, now.plusSeconds(16)));
        byte[] altered = (new String(body, java.nio.charset.StandardCharsets.UTF_8) + " ").getBytes(java.nio.charset.StandardCharsets.UTF_8);
        assertThrows(ApiException.class, () -> client.verify(request, altered, timestamp, signature, now));
        byte[] trailing = (new String(body, java.nio.charset.StandardCharsets.UTF_8) + "{}").getBytes(java.nio.charset.StandardCharsets.UTF_8);
        assertThrows(ApiException.class, () -> client.verify(request, trailing, timestamp, CatalogEligibilityProtocol.sign(key, "RESPONSE", timestamp, trailing), now));
    }
    @Test void rejectsIncompleteDuplicateOversizedAndUnknownFieldResponses() throws Exception {
        var node = json.valueToTree(snapshot());
        ((com.fasterxml.jackson.databind.node.ObjectNode)node).put("complete", false);
        assertThrows(ApiException.class, () -> verify(node));
        var duplicate = snapshot(); UUID chef = UUID.randomUUID();
        assertThrows(ApiException.class, () -> verify(new CatalogFinanceEligibility.Snapshot(request, now, true, duplicate.policyId(), 1, "a".repeat(64), List.of(chef, chef))));
        assertThrows(ApiException.class, () -> verify(new CatalogFinanceEligibility.Snapshot(request, now, true, duplicate.policyId(), 1, "a".repeat(64),
            java.util.stream.IntStream.range(0,1001).mapToObj(i -> new UUID(1, i)).toList())));
        var extra = json.valueToTree(snapshot()); ((com.fasterxml.jackson.databind.node.ObjectNode)extra).put("bankAccount", "must-never-appear");
        assertThrows(ApiException.class, () -> verify(extra));
    }
    @Test void rejectsMissingConfigurationAndNonHttpsOriginsWithoutNetwork() {
        for (String origin : List.of("", "http://finance.invalid", "https://finance.invalid/path", "https://user@finance.invalid", "https://finance.invalid?x=1")) {
            assertThrows(ApiException.class, () -> new CatalogFinanceEligibility(origin, key, json).current());
        }
        assertThrows(ApiException.class, () -> new CatalogFinanceEligibility("https://finance.invalid", "", json).current());
    }
    /** Counts fetches instead of calling Integration. */
    private static final class Counting extends CatalogFinanceEligibility {
        final AtomicInteger fetches = new AtomicInteger();
        volatile Supplier<Snapshot> answer;
        Counting(ObjectMapper json) { super("https://finance.invalid", "k".repeat(32), json, null); }
        @Override Snapshot fetch() { fetches.incrementAndGet(); return answer.get(); }
    }
    @Test void reusesOneVerifiedAnswerForTwoSecondsThenAsksAgain() {
        var eligibility = new Counting(json);
        long[] nanos = {0};
        eligibility.clock = () -> nanos[0];
        var first = snapshot();
        eligibility.answer = () -> first;
        assertSame(first, eligibility.current());
        nanos[0] = Duration.ofMillis(1999).toNanos();
        assertSame(first, eligibility.current());
        assertEquals(1, eligibility.fetches.get());
        nanos[0] = Duration.ofMillis(2000).toNanos();
        eligibility.current();
        assertEquals(2, eligibility.fetches.get());
    }
    @Test void neverReusesAFailedFetch() {
        var eligibility = new Counting(json);
        eligibility.clock = () -> 0;
        eligibility.answer = () -> { throw new ApiException(503, "CATALOG_ELIGIBILITY_UNAVAILABLE", "x"); };
        assertThrows(ApiException.class, eligibility::current);
        assertThrows(ApiException.class, eligibility::current);
        assertEquals(2, eligibility.fetches.get());
        var answer = snapshot();
        eligibility.answer = () -> answer;
        assertSame(answer, eligibility.current());
    }
    @Test void concurrentRequestsShareOneFetch() throws Exception {
        var eligibility = new Counting(json);
        eligibility.clock = () -> 0;
        var release = new CountDownLatch(1);
        var answer = snapshot();
        eligibility.answer = () -> {
            try { release.await(); } catch (InterruptedException ex) { throw new IllegalStateException(ex); }
            return answer;
        };
        var pool = Executors.newFixedThreadPool(8);
        try {
            List<Future<CatalogFinanceEligibility.Snapshot>> calls = new ArrayList<>();
            for (int i = 0; i < 8; i++) calls.add(pool.submit(eligibility::current));
            Thread.sleep(200);
            release.countDown();
            for (var call : calls) assertSame(answer, call.get(5, TimeUnit.SECONDS));
            assertEquals(1, eligibility.fetches.get());
        } finally { pool.shutdownNow(); }
    }
    @Test void backgroundRefreshNeverMakesRequestsWait() throws Exception {
        var eligibility = new Counting(json);
        long[] nanos = {0};
        eligibility.clock = () -> nanos[0];
        var first = snapshot();
        eligibility.answer = () -> first;
        assertSame(first, eligibility.current());
        var second = snapshot();
        var release = new CountDownLatch(1);
        eligibility.answer = () -> {
            try { release.await(); } catch (InterruptedException ex) { throw new IllegalStateException(ex); }
            return second;
        };
        nanos[0] = Duration.ofMillis(1500).toNanos();
        var background = Executors.newSingleThreadExecutor();
        try {
            var refresh = background.submit(eligibility::refreshQuietly);
            long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
            while (eligibility.fetches.get() < 2 && System.nanoTime() < deadline) Thread.sleep(5);
            assertEquals(2, eligibility.fetches.get());
            nanos[0] = Duration.ofMillis(1900).toNanos();
            assertSame(first, assertTimeoutPreemptively(Duration.ofSeconds(2), eligibility::current));
            release.countDown();
            refresh.get(5, TimeUnit.SECONDS);
            nanos[0] = Duration.ofMillis(3400).toNanos(); // 1.9 s after the background fetch began
            assertSame(second, eligibility.current());
            assertEquals(2, eligibility.fetches.get());
        } finally { background.shutdownNow(); }
    }
    @Test void answerAgeCountsFromWhenItsFetchBegan() {
        var eligibility = new Counting(json);
        long[] nanos = {0};
        eligibility.clock = () -> nanos[0];
        var slow = snapshot();
        eligibility.answer = () -> { nanos[0] = Duration.ofMillis(1500).toNanos(); return slow; };
        assertSame(slow, eligibility.current());
        nanos[0] = Duration.ofMillis(2000).toNanos();
        var next = snapshot();
        eligibility.answer = () -> next;
        assertSame(next, eligibility.current());
        assertEquals(2, eligibility.fetches.get());
    }
    @Test void failedBackgroundRefreshKeepsTheLastAnswerOnlyUntilItIsTwoSecondsOld() {
        var eligibility = new Counting(json);
        long[] nanos = {0};
        eligibility.clock = () -> nanos[0];
        var first = snapshot();
        eligibility.answer = () -> first;
        eligibility.current();
        eligibility.answer = () -> { throw new ApiException(503, "CATALOG_ELIGIBILITY_UNAVAILABLE", "x"); };
        nanos[0] = Duration.ofMillis(500).toNanos();
        eligibility.refreshQuietly();
        nanos[0] = Duration.ofMillis(1999).toNanos();
        assertSame(first, eligibility.current());
        nanos[0] = Duration.ofMillis(2000).toNanos();
        assertThrows(ApiException.class, eligibility::current);
        assertEquals(3, eligibility.fetches.get());
    }
    @Test void refreshesInTheBackgroundOnceStarted() throws Exception {
        var eligibility = new Counting(json);
        var answer = snapshot();
        eligibility.answer = () -> answer;
        eligibility.startRefresh();
        try {
            long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
            while (eligibility.fetches.get() < 2 && System.nanoTime() < deadline) Thread.sleep(20);
            assertTrue(eligibility.fetches.get() >= 2);
            assertSame(answer, eligibility.current());
        } finally { eligibility.stopRefresh(); }
    }
    @Test void boundsBodyBeforeAllocatingEntireResponse() {
        var subscriber = new CatalogFinanceEligibility.BoundedBody();
        Flow.Subscription subscription = mock(Flow.Subscription.class);
        subscriber.onSubscribe(subscription);
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[CatalogEligibilityProtocol.MAX_RESPONSE_BYTES])));
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[1])));
        org.mockito.Mockito.verify(subscription).cancel();
        assertTrue(subscriber.getBody().toCompletableFuture().isCompletedExceptionally());
    }
}
