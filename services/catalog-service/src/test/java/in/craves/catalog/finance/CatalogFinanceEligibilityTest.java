package in.craves.catalog.finance;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.catalog.exception.ApiException;
import java.nio.ByteBuffer;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Flow;
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
