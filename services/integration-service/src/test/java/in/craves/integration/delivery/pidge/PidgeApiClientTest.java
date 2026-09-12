package in.craves.integration.delivery.pidge;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.PidgeProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PidgeApiClientTest {
    final ObjectMapper mapper = new ObjectMapper();
    final PidgeProperties properties = new PidgeProperties();
    final PidgeTransport transport = mock(PidgeTransport.class);
    final PidgeBookingRepository bookings = mock(PidgeBookingRepository.class);
    final PidgeApiClient client = new PidgeApiClient(properties, transport, bookings, mapper);
    @BeforeEach void setup() {
        properties.setEnabled(true); properties.setCreateEnabled(true); properties.setAuthToken("test-token");
        properties.setWebhookToken("test-callback"); properties.setProductionActivationApproved(true);
        properties.setManualAllocationVerified(true); properties.setWebhookVerified(true);
    }
    QuoteRequest request() {
        return new QuoteRequest("Food", 500, false, stop("500081", "Kitchen"), stop("500032", "Customer"),
            List.of(new ShipmentItem(UUID.randomUUID(), "Meal", new BigDecimal("100"), 1, new BigDecimal("100"))),
            new BigDecimal("100"), "PREPAID", UUID.randomUUID());
    }
    Stop stop(String pin, String name) {
        return new Stop("Test address", name, "+919000000001", new BigDecimal("17.44"), new BigDecimal("78.38"),
            null, null, null, "Test address", null, null, null, "Hyderabad", "Telangana", pin, "IN");
    }
    JsonNode quote(String price, boolean now) throws Exception {
        return mapper.readTree("{\"data\":{\"items\":[{\"network_id\":\"6\",\"network_name\":\"Partner\",\"service\":\"porter\",\"pickup_now\":"
            + now + ",\"quote\":{\"price\":" + price + "},\"token\":\"ephemeral-secret\"}]}}");
    }
    JsonNode order(String status, String fulfillment) throws Exception {
        return mapper.readTree("{\"data\":{\"id\":\"order-1\",\"dd_channel\":{\"order_id\":\"ref-1\"},\"status\":\"" + status
            + "\",\"updated_at\":\"2026-09-12T08:00:00Z\",\"fulfillment\":{\"status\":\"" + fulfillment + "\"}}}");
    }
    @Test void quoteNeverCreatesOrPersistsProviderTokens() throws Exception {
        when(transport.quote(any())).thenReturn(quote("59.00", true));
        ProviderQuote quote = client.readOnlyQuote(request());
        assertTrue(quote.available()); assertEquals(0, new BigDecimal("59.00").compareTo(quote.deliveryFeeAmount()));
        assertFalse(quote.providerMetadata().toString().contains("ephemeral-secret"));
        verify(transport, never()).mutate(anyString(), any()); verifyNoInteractions(bookings);
    }
    @Test void rejectsScheduledPartners() throws Exception {
        when(transport.quote(any())).thenReturn(quote("59.00", false));
        assertFalse(client.readOnlyQuote(request()).available());
    }
    @Test void disabledCreateDoesNotMakeChargeableQuoteCalls() {
        properties.setCreateEnabled(false);
        assertFalse(client.quote(request()).available()); verifyNoInteractions(transport);
    }
    @Test void payloadUsesRealWeightAndPrepaidFood() {
        var body = client.buildOrder("ref-1", request());
        assertEquals("food", body.at("/trips/0/order_category").asText());
        assertEquals(500, body.at("/trips/0/packages/0/dead_weight").asInt());
        assertFalse(body.at("/trips/0/packages/0").has("volumetric_weight"));
        assertEquals(0, body.at("/trips/0/cod_amount").asInt());
        assertEquals("9000000001", body.at("/sender_detail/mobile").asText());
    }
    @Test void createsThenConfirmsSelectedPartner() throws Exception {
        QuoteRequest request = request();
        when(transport.quote(any())).thenReturn(quote("59", true));
        ProviderQuote selected = client.quote(request);
        when(bookings.claim("ref-1")).thenReturn(true);
        when(transport.mutate(endsWith("/order"), any())).thenReturn(mapper.readTree("{\"data\":{\"ref-1\":\"order-1\"}}"));
        when(transport.get(endsWith("/order/order-1"))).thenReturn(order("pending", ""), order("fulfilled", "OUT_FOR_PICKUP"));
        when(transport.get(contains("fulfillment/services"))).thenReturn(quote("59", true));
        assertEquals(DeliveryStatus.COURIER_TO_PICKUP, client.create(new CreateDeliveryRequest("ref-1", request, selected)).status());
        verify(transport).mutate(endsWith("/order/fulfill"), argThat(b -> b.path("pickup_now").asBoolean() && "6".equals(b.path("network_id").asText())));
        verify(bookings).recordCreated("ref-1", "order-1"); verify(bookings).mark("ref-1", "FULFILLED");
    }
    @Test void changedPriceCancelsBeforeFallback() throws Exception {
        QuoteRequest request = request();
        when(transport.quote(any())).thenReturn(quote("59", true));
        ProviderQuote selected = client.quote(request);
        when(bookings.claim("ref-1")).thenReturn(true);
        when(transport.mutate(endsWith("/order"), any())).thenReturn(mapper.readTree("{\"data\":{\"ref-1\":\"order-1\"}}"));
        when(transport.get(endsWith("/order/order-1"))).thenReturn(order("pending", ""), order("cancelled", ""));
        when(transport.get(contains("fulfillment/services"))).thenReturn(quote("60", true));
        assertThrows(PidgeApiClient.BookingRejectedException.class, () -> client.create(new CreateDeliveryRequest("ref-1", request, selected)));
        verify(transport, never()).mutate(endsWith("/order/fulfill"), any());
        verify(bookings).mark("ref-1", "CANCELLED");
    }
    @Test void uncertainCreateBlocksFallbackAndRetry() throws Exception {
        QuoteRequest request = request(); when(transport.quote(any())).thenReturn(quote("59", true));
        ProviderQuote selected = client.quote(request); when(bookings.claim("ref-1")).thenReturn(true);
        when(transport.mutate(anyString(), any())).thenThrow(new PidgeTransport.ApiException("timeout", true));
        assertThrows(ProviderCreateUncertainException.class, () -> client.create(new CreateDeliveryRequest("ref-1", request, selected)));
        verify(transport, times(1)).mutate(anyString(), any()); verify(bookings, never()).mark(any(), any());
    }
    @Test void incompleteSuccessIsUncertain() throws Exception {
        QuoteRequest request = request(); when(transport.quote(any())).thenReturn(quote("59", true));
        ProviderQuote selected = client.quote(request); when(bookings.claim("ref-1")).thenReturn(true);
        when(transport.mutate(anyString(), any())).thenReturn(mapper.createObjectNode());
        assertThrows(ProviderCreateUncertainException.class, () -> client.create(new CreateDeliveryRequest("ref-1", request, selected)));
    }
    @Test void previousClaimPreventsSecondCreate() throws Exception {
        QuoteRequest request = request(); when(transport.quote(any())).thenReturn(quote("59", true));
        ProviderQuote selected = client.quote(request);
        when(bookings.find("ref-1")).thenReturn(Optional.of(new PidgeBookingRepository.Booking(null, "ATTEMPTING")));
        assertThrows(ProviderCreateUncertainException.class, () -> client.create(new CreateDeliveryRequest("ref-1", request, selected)));
        verify(transport, never()).mutate(anyString(), any());
    }
    @Test void reconciliationNeverTreatsMissingWebhookAsNoBooking() {
        assertEquals(CreateReconciliationStatus.INCONCLUSIVE, client.reconcileCreate("ref-1", Instant.now()).status());
        verifyNoInteractions(transport);
    }
    @Test void trackingRejectsWrongProviderOrder() throws Exception {
        when(transport.get(anyString())).thenReturn(order("fulfilled", "DELIVERED"));
        assertThrows(IllegalStateException.class, () -> client.track("other-id"));
    }
    @Test void parentCompletedDoesNotMeanDelivered() throws Exception {
        assertEquals(DeliveryStatus.RETURNED, PidgeStatusMapper.map(order("completed", "RTO_DELIVERED").path("data")));
        assertEquals(DeliveryStatus.UNKNOWN, PidgeStatusMapper.map(order("completed", "").path("data")));
        assertEquals(DeliveryStatus.PENDING, PidgeStatusMapper.map(order("pending", "CANCELLED").path("data")));
    }
    @Test void rejectsCredentialExfiltrationOriginAndMissingActivationGates() {
        properties.setBaseUrl("https://api.pidge.in.attacker.example"); assertThrows(IllegalStateException.class, properties::validate);
        properties.setBaseUrl("https://api.pidge.in"); properties.setWebhookVerified(false);
        assertThrows(IllegalStateException.class, properties::validate);
    }
}
