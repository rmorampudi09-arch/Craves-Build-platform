package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class DeliveryProviderRouterTest {

    @Test
    void fallsBackToNextRankedProviderWithoutRequoting() {
        DeliveryProviderCatalogRepository catalog = mock(DeliveryProviderCatalogRepository.class);
        when(catalog.activeProviderIds()).thenReturn(List.of("fast", "backup"));

        FakeAdapter fast = new FakeAdapter("fast", 5, "110.00", true);
        FakeAdapter backup = new FakeAdapter("backup", 8, "90.00", false);
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setQuoteTimeoutSeconds(4);
        properties.setMaxProviderAttempts(2);
        DeliveryProviderRouter router = new DeliveryProviderRouter(
            List.of(fast, backup), catalog, properties
        );

        var result = router.route(command());

        assertThat(result.providerId()).isEqualTo("backup");
        assertThat(result.delivery().providerDeliveryId()).isEqualTo("backup-delivery-1");
        assertThat(result.quoteAudit()).hasSize(2);
        assertThat(result.createAudit())
            .extracting(DeliveryCommandModels.CreateAudit::providerId)
            .containsExactly("fast", "backup");
        assertThat(result.createAudit().get(0).successful()).isFalse();
        assertThat(result.createAudit().get(1).successful()).isTrue();
        assertThat(fast.quoteCalls()).isEqualTo(1);
        assertThat(backup.quoteCalls()).isEqualTo(1);

        router.closeExecutor();
    }

    private static DeliveryCommandMessage command() {
        UUID orderId = UUID.randomUUID();
        UUID subOrderId = UUID.randomUUID();
        DeliveryProviderAdapter.Stop pickup = new DeliveryProviderAdapter.Stop(
            "Madhapur, Hyderabad", "Chef", "919999999991",
            new BigDecimal("17.4483"), new BigDecimal("78.3915"),
            null, null, "Pickup"
        );
        DeliveryProviderAdapter.Stop dropoff = new DeliveryProviderAdapter.Stop(
            "Gachibowli, Hyderabad", "Customer", "919999999992",
            new BigDecimal("17.4401"), new BigDecimal("78.3489"),
            null, null, "Dropoff"
        );
        DeliveryProviderAdapter.QuoteRequest quoteRequest = new DeliveryProviderAdapter.QuoteRequest(
            "Packaged food", 2, true, pickup, dropoff
        );
        return new DeliveryCommandMessage(
            UUID.randomUUID(), UUID.randomUUID(), orderId, orderId, subOrderId,
            Instant.now().plusSeconds(1800), Instant.now(), subOrderId.toString(), quoteRequest
        );
    }

    private static final class FakeAdapter implements DeliveryProviderAdapter {
        private final String providerId;
        private final int pickupEtaMinutes;
        private final BigDecimal fee;
        private final boolean failCreate;
        private final AtomicInteger quoteCalls = new AtomicInteger();
        private final AtomicInteger createCalls = new AtomicInteger();
        private final ObjectMapper objectMapper = new ObjectMapper();

        private FakeAdapter(String providerId,
                            int pickupEtaMinutes,
                            String fee,
                            boolean failCreate) {
            this.providerId = providerId;
            this.pickupEtaMinutes = pickupEtaMinutes;
            this.fee = new BigDecimal(fee);
            this.failCreate = failCreate;
        }

        @Override
        public String providerId() {
            return providerId;
        }

        @Override
        public ProviderQuote quote(QuoteRequest request) {
            quoteCalls.incrementAndGet();
            JsonNode metadata = objectMapper.createObjectNode()
                .put("pickup_eta_minutes", pickupEtaMinutes);
            return new ProviderQuote(
                providerId, true, fee, fee, "INR", List.of(), metadata, Instant.now()
            );
        }

        @Override
        public ProviderDelivery create(CreateDeliveryRequest request) {
            int attempt = createCalls.incrementAndGet();
            if (failCreate) {
                throw new IllegalStateException(providerId + " create failed");
            }
            return new ProviderDelivery(
                providerId,
                providerId + "-delivery-" + attempt,
                providerId + "-order",
                DeliveryStatus.SEARCHING,
                "planned",
                fee,
                fee,
                "https://tracking.example/" + providerId,
                objectMapper.createObjectNode(),
                Instant.now()
            );
        }

        @Override
        public ProviderDelivery cancel(String providerDeliveryId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public TrackingSnapshot track(String providerDeliveryId) {
            throw new UnsupportedOperationException();
        }

        int quoteCalls() {
            return quoteCalls.get();
        }
    }
}
