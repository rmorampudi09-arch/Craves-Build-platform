package in.craves.integration.delivery.provider;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Provider-neutral contract used by the Integration Service delivery worker.
 * One adapter implementation exists per external delivery provider.
 */
public interface DeliveryProviderAdapter {
    String providerId();

    /**
     * What a courier is known to offer. THERMOBOX: it can be asked for a hot-food box. PROVIDER_EVENT_TIME: its status
     * events carry the courier's own time. Claimed only once the courier's documents or a sandbox test show it.
     */
    enum Capability { THERMOBOX, PROVIDER_EVENT_TIME }

    /** Unknown counts as not offered. Read only with CRAVES_DELIVERY_COURIER_CAPABILITIES_ENABLED on. */
    default java.util.Set<Capability> capabilities() {
        return java.util.Set.of();
    }

    /** What an order needs of its courier. */
    static java.util.Set<Capability> needs(QuoteRequest request) {
        return request != null && request.thermoboxRequired() ? java.util.Set.of(Capability.THERMOBOX) : java.util.Set.of();
    }

    ProviderQuote quote(QuoteRequest request);

    /**
     * Books the delivery. Once the provider may have accepted the request, every failure, including one in this adapter's
     * own handling of the answer, must be raised as ProviderCreateUncertainException: the caller reads any other exception
     * as "nothing was booked" and moves to the next provider.
     */
    ProviderDelivery create(CreateDeliveryRequest request);

    ProviderDelivery cancel(String providerDeliveryId);

    TrackingSnapshot track(String providerDeliveryId);

    /**
     * Webhook-first tracking's poll. hasNews: whether a reading differs from what the job holds; a courier may skip calls
     * whose answer only a changed job uses.
     */
    default TrackingSnapshot track(String providerDeliveryId, java.util.function.Predicate<ProviderDelivery> hasNews) {
        return track(providerDeliveryId);
    }

    /**
     * Attempts to locate a delivery that may already have been created by the provider after Craves
     * lost the create response. Implementations must never create a new provider delivery from this
     * method.
     */
    default CreateReconciliationResult reconcileCreate(String clientReference,
                                                        Instant notBefore) {
        return CreateReconciliationResult.unsupported(
            "Provider does not support deterministic create reconciliation"
        );
    }

    enum DeliveryStatus {
        PENDING,
        SEARCHING,
        COURIER_ASSIGNED,
        COURIER_TO_PICKUP,
        AT_PICKUP,
        PICKED_UP,
        IN_TRANSIT,
        AT_DROPOFF,
        DELIVERED,
        CANCELLED,
        DELAYED,
        RETURNING,
        RETURNED,
        FAILED,
        UNKNOWN
    }

    enum CreateReconciliationStatus {
        FOUND,
        NOT_FOUND,
        INCONCLUSIVE,
        UNSUPPORTED
    }

    /**
     * Canonical delivery stop. The original free-form address remains authoritative for providers
     * that accept it directly (for example Borzo). The additive structured fields preserve address
     * data that Order Service already owns for providers that need them.
     */
    record Stop(
        String address,
        String contactName,
        String contactPhone,
        BigDecimal latitude,
        BigDecimal longitude,
        OffsetDateTime requiredStart,
        OffsetDateTime requiredFinish,
        String note,
        String addressLine1,
        String addressLine2,
        String landmark,
        String area,
        String city,
        String state,
        String postalCode,
        String country
    ) {
        public Stop(String address,
                    String contactName,
                    String contactPhone,
                    BigDecimal latitude,
                    BigDecimal longitude,
                    OffsetDateTime requiredStart,
                    OffsetDateTime requiredFinish,
                    String note) {
            this(
                address,
                contactName,
                contactPhone,
                latitude,
                longitude,
                requiredStart,
                requiredFinish,
                note,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null
            );
        }
    }

    record ShipmentItem(
        UUID menuItemId,
        String itemName,
        BigDecimal unitPrice,
        int quantity,
        BigDecimal lineTotal
    ) {}

    record QuoteRequest(
        String matter,
        int totalWeightGrams,
        boolean thermoboxRequired,
        Stop pickup,
        Stop dropoff,
        List<ShipmentItem> items,
        BigDecimal declaredGoodsValue,
        String paymentCollectionMode,
        UUID pickupLocationReference
    ) {
        public QuoteRequest(String matter,
                            int totalWeightGrams,
                            boolean thermoboxRequired,
                            Stop pickup,
                            Stop dropoff) {
            this(
                matter,
                totalWeightGrams,
                thermoboxRequired,
                pickup,
                dropoff,
                List.of(),
                null,
                null,
                null
            );
        }
    }

    /**
     * The selected quote is carried into create so an adapter can deterministically book the same
     * courier/service option that delivery intelligence ranked. The legacy constructor remains for
     * existing providers that do not require quote metadata during create.
     */
    record CreateDeliveryRequest(
        String clientReference,
        QuoteRequest quoteRequest,
        ProviderQuote selectedQuote
    ) {
        public CreateDeliveryRequest(String clientReference, QuoteRequest quoteRequest) {
            this(clientReference, quoteRequest, null);
        }
    }

    record ProviderQuote(
        String providerId,
        boolean available,
        BigDecimal paymentAmount,
        BigDecimal deliveryFeeAmount,
        String currency,
        List<String> warnings,
        JsonNode providerMetadata,
        Instant quotedAt
    ) {}

    record ProviderDelivery(
        String providerId,
        String providerDeliveryId,
        String providerOrderName,
        DeliveryStatus status,
        String providerStatus,
        BigDecimal paymentAmount,
        BigDecimal deliveryFeeAmount,
        String trackingUrl,
        JsonNode providerMetadata,
        Instant observedAt
    ) {}

    record Courier(
        String providerCourierId,
        String name,
        String phone,
        String photoUrl,
        BigDecimal latitude,
        BigDecimal longitude
    ) {}

    record TrackingSnapshot(
        ProviderDelivery delivery,
        Courier courier,
        Instant observedAt
    ) {}

    record ProviderStatusUpdate(
        String providerId,
        String providerOrderId,
        String providerDeliveryId,
        DeliveryStatus status,
        String providerStatus,
        String trackingUrl,
        Instant observedAt,
        JsonNode providerMetadata,
        Courier courier
    ) {
        public ProviderStatusUpdate(String providerId,
                                    String providerOrderId,
                                    String providerDeliveryId,
                                    DeliveryStatus status,
                                    String providerStatus,
                                    String trackingUrl,
                                    Instant observedAt,
                                    JsonNode providerMetadata) {
            this(providerId, providerOrderId, providerDeliveryId, status, providerStatus,
                trackingUrl, observedAt, providerMetadata, null);
        }

        public ProviderStatusUpdate {
            Objects.requireNonNull(providerId, "providerId is required");
            Objects.requireNonNull(providerOrderId, "providerOrderId is required");
            Objects.requireNonNull(status, "status is required");
            Objects.requireNonNull(observedAt, "observedAt is required");
            providerMetadata = providerMetadata == null
                ? null
                : providerMetadata.deepCopy();
        }

        public static ProviderStatusUpdate fromTracking(TrackingSnapshot snapshot) {
            Objects.requireNonNull(snapshot, "snapshot is required");
            ProviderDelivery delivery = Objects.requireNonNull(
                snapshot.delivery(),
                "tracking delivery is required"
            );
            Instant observedAt = snapshot.observedAt() == null
                ? delivery.observedAt()
                : snapshot.observedAt();
            return new ProviderStatusUpdate(
                delivery.providerId(),
                delivery.providerDeliveryId(),
                null,
                delivery.status(),
                delivery.providerStatus(),
                delivery.trackingUrl(),
                Objects.requireNonNull(
                    observedAt,
                    "tracking observedAt is required"
                ),
                delivery.providerMetadata(),
                snapshot.courier()
            );
        }
    }

    record CreateReconciliationResult(
        CreateReconciliationStatus status,
        ProviderDelivery delivery,
        String detail
    ) {
        public CreateReconciliationResult {
            Objects.requireNonNull(status, "status is required");
            if (status == CreateReconciliationStatus.FOUND && delivery == null) {
                throw new IllegalArgumentException(
                    "FOUND reconciliation requires a provider delivery"
                );
            }
            if (status != CreateReconciliationStatus.FOUND && delivery != null) {
                throw new IllegalArgumentException(
                    "Only FOUND reconciliation may contain a provider delivery"
                );
            }
        }

        public static CreateReconciliationResult found(ProviderDelivery delivery) {
            return new CreateReconciliationResult(
                CreateReconciliationStatus.FOUND,
                Objects.requireNonNull(delivery, "delivery is required"),
                "Provider delivery recovered by deterministic client reference"
            );
        }

        public static CreateReconciliationResult notFound(String detail) {
            return new CreateReconciliationResult(
                CreateReconciliationStatus.NOT_FOUND,
                null,
                detail
            );
        }

        public static CreateReconciliationResult inconclusive(String detail) {
            return new CreateReconciliationResult(
                CreateReconciliationStatus.INCONCLUSIVE,
                null,
                detail
            );
        }

        public static CreateReconciliationResult unsupported(String detail) {
            return new CreateReconciliationResult(
                CreateReconciliationStatus.UNSUPPORTED,
                null,
                detail
            );
        }
    }

    /**
     * Raised only when the provider create request may have succeeded but the response was not
     * received. Callers must reconcile the deterministic client reference before any retry or
     * provider fallback.
     */
    class ProviderCreateUncertainException extends RuntimeException {
        private final String providerId;
        private final String clientReference;
        private final Instant attemptedAt;

        public ProviderCreateUncertainException(String providerId,
                                                 String clientReference,
                                                 Instant attemptedAt,
                                                 Throwable cause) {
            super(
                "Provider create outcome is uncertain and requires reconciliation",
                cause
            );
            this.providerId = Objects.requireNonNull(providerId, "providerId is required");
            this.clientReference = Objects.requireNonNull(clientReference, "clientReference is required");
            this.attemptedAt = Objects.requireNonNull(attemptedAt, "attemptedAt is required");
        }

        public String providerId() { return providerId; }
        public String clientReference() { return clientReference; }
        public Instant attemptedAt() { return attemptedAt; }
    }

    /**
     * Raised when the provider definitely created nothing: it refused the request, or the request never left. The caller
     * may move to the next provider at once. verifyLater asks for one later lookup, to check that reading of the answer.
     */
    class ProviderCreateRejectedException extends RuntimeException {
        private final String providerId;
        private final boolean verifyLater;

        public ProviderCreateRejectedException(String providerId, boolean verifyLater, String message, Throwable cause) {
            super(message, cause);
            this.providerId = Objects.requireNonNull(providerId, "providerId is required");
            this.verifyLater = verifyLater;
        }

        public String providerId() { return providerId; }
        public boolean verifyLater() { return verifyLater; }
    }
}
