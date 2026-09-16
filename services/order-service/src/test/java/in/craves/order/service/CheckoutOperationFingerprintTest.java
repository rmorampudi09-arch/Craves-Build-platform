package in.craves.order.service;

import static org.assertj.core.api.Assertions.*;
import in.craves.order.web.ApiDtos.*;
import in.craves.order.web.CheckoutOperationDtos.Request;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CheckoutOperationFingerprintTest {
    final UUID address = UUID.randomUUID(), cart = UUID.randomUUID(), item = UUID.randomUUID();
    final Instant at = Instant.parse("2026-09-13T01:00:00Z");
    Request request(UUID addressId, String note, int quantity, Instant updated) {
        return new Request(addressId, note, new CartSnapshotRequest(cart, List.of(new CartSnapshotItem(item, quantity, updated))));
    }
    @Test void replayHasStableFingerprintAndEveryConsentFieldMatters() {
        String expected = CheckoutOperationFingerprint.of(request(address, null, 1, at));
        assertThat(expected).hasSize(64).isEqualTo(CheckoutOperationFingerprint.of(request(address, null, 1, at)));
        for (Request changed : List.of(request(UUID.randomUUID(), null, 1, at), request(address, "", 1, at),
            request(address, "hello", 1, at), request(address, null, 2, at), request(address, null, 1, at.plusNanos(1)))) {
            assertThat(CheckoutOperationFingerprint.of(changed)).isNotEqualTo(expected);
        }
    }
    @Test void lineOrderingDoesNotChangeAnIdenticalSnapshot() {
        var first = new CartSnapshotItem(item, 1, at);
        var second = new CartSnapshotItem(UUID.randomUUID(), 2, at);
        assertThat(CheckoutOperationFingerprint.of(new Request(address, null, new CartSnapshotRequest(cart, List.of(first, second)))))
            .isEqualTo(CheckoutOperationFingerprint.of(new Request(address, null, new CartSnapshotRequest(cart, List.of(second, first)))));
    }
}
