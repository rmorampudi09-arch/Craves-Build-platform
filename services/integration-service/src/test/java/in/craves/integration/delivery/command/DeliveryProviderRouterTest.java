package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentRequest;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentResponse;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStatus;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStrategy;
import in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateScore;
import in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateStatus;
import in.craves.integration.delivery.DeliveryIntelligenceModels.Momentum;
import in.craves.integration.delivery.DeliveryIntelligenceService;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class DeliveryProviderRouterTest {

    @Test
    void usesIntelligentSelectionThenFallsBackWithoutRequoting() {
        DeliveryProviderCatalogRepository catalog = mock(DeliveryProviderCatalogRepository.class);
        DeliveryIntelligenceService intelligence = mock(DeliveryIntelligenceService.class);
        when(catalog.activeProviderIds()).thenReturn(List.of("fast", "backup"));

        FakeAdapter fast = new FakeAdapter("fast", 5, "110.00", true);
        FakeAdapter backup = new FakeAdapter("backup", 8, "90.00", false);
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setQuoteTimeoutSeconds(4);
        properties.setMaxProviderAttempts(2);

        UUID fastCandidateId = UUID.randomUUID();
        UUID backupCandidateId = UUID.randomUUID();
        AssignmentResponse assignment = assignment(fastCandidateId, backupCandidateId);
        when(intelligence.assign(any())).thenReturn(assignment);

        DeliveryProviderRouter router = new DeliveryProviderRouter(
            List.of(fast, backup), catalog, intelligence, properties
        );

        var result = router.route(command());

        assertThat(result.providerId()).isEqualTo("backup");
        assertThat(result.delivery().providerDeliveryId()).isEqualTo("backup-delivery-1");
        assertThat(result.intelligenceAssignment().assignmentId()).isEqualTo(assignment.assignmentId());
        assertThat(result.executedCandidateId()).isEqualTo(backupCandidateId);
        assertThat(result.quoteAudit()).hasSize(2);
        assertThat(result.createAudit())
            .extracting(DeliveryCommandModels.CreateAudit::providerId)
            .containsExactly("fast", "backup");
        assertThat(result.createAudit().get(0).successful()).isFalse();
        assertThat(result.createAudit().get(1).successful()).isTrue();
        assertThat(fast.quoteCalls()).isEqualTo(1);
        assertThat(backup.quoteCalls()).isEqualTo(1);

        ArgumentCaptor<AssignmentRequest> request = ArgumentCaptor.forClass(AssignmentRequest.class);
        verify(intelligence).assign(request.capture());
        assertThat(request.getValue().area()).isEqualTo("Madhapur");
        assertThat(request.getValue().distanceKm()).isEqualTo(4.6);
        assertThat(request.getValue().candidates()).hasSize(2);

        router.closeExecutor();
    }

    private static AssignmentResponse assignment(UUID fastCandidateId, UUID backupCandidateId) {
        ObjectMapper objectMapper = new ObjectMapper();
        CandidateScore fast = new CandidateScore(
            fastCandidateId, 1, "fast", "fast-quote", null,
            null, 5.0, new BigDecimal("110.00"), "INR",
            0.95, 95.0, 95.0, 95.0, Momentum.STABLE,
            0.5, 92.0, 83.0, 88.0, CandidateStatus.SELECTED,
            objectMapper.createObjectNode().put("pickup_eta_minutes", 5)
        );
        CandidateScore backup = new CandidateScore(
            backupCandidateId, 2, "backup", "backup-quote", null,
            null, 8.0, new BigDecimal("90.00"), "INR",
            0.90, 90.0, 90.0, 90.0, Momentum.STABLE,
            0.5, 88.0, 73.0, 82.0, CandidateStatus.RANKED,
            objectMapper.createObjectNode().put("pickup_eta_minutes", 8)
        );
        return new AssignmentResponse(
            UUID.randomUUID(),
            UUID.randomUUID(),
            UUID.randomUUID(),
            AssignmentStrategy.STOCHASTIC,
            AssignmentStatus.RANKED,
            "HEURISTIC_V1|ROLLING_V1|BANDIT_V1|PROXIMITY_QUALITY_V2",
            fastCandidateId,
            "fast",
            null,
            List.of(fast, backup),
            Instant.now()
        );
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
            "Packaged food", 2000, true, pickup, dropoff
        );
        return new DeliveryCommandMessage(
            UUID.randomUUID(), UUID.randomUUID(), orderId, orderId, subOrderId,
            Instant.now().plusSeconds(1800), Instant.now(), subOrderId.toString(),
            4.6, "Madhapur", 19, 1, quoteRequest
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
                .put("provider_quote_id", providerId + "-quote")
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
