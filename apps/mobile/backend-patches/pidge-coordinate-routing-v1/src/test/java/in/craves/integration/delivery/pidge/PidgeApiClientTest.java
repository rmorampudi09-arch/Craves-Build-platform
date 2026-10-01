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
    Stop stopWithLocation(Stop source, String city, BigDecimal latitude, BigDecimal longitude) {
        return new Stop(source.address(), source.contactName(), source.contactPhone(), latitude, longitude,
            source.requiredStart(), source.requiredFinish(), source.note(), source.addressLine1(), source.addressLine2(),
            source.landmark(), source.area(), city, source.state(), source.postalCode(), source.country());
    }
    QuoteRequest withStops(QuoteRequest source, Stop pickup, Stop dropoff) {
        return new QuoteRequest(source.matter(), source.totalWeightGrams(), source.thermoboxRequired(), pickup, dropoff,
            source.items(), source.declaredGoodsValue(), source.paymentCollectionMode(), source.pickupLocationReference());
    }
    @Test void cityAliasesDoNotBlockCoordinateQuoteOrBookingPayload() throws Exception {
        QuoteRequest source = request();
        Stop pickup = stopWithLocation(source.pickup(), "HYD", new BigDecimal("17.4489"), new BigDecimal("78.3908"));
        Stop dropoff = stopWithLocation(source.dropoff(), "Hyderabad", new BigDecimal("17.4401"), new BigDecimal("78.3489"));
        QuoteRequest aliased = withStops(source, pickup, dropoff);
        when(transport.quote(any())).thenReturn(quote("59", true));
        assertTrue(client.quote(aliased).available());
        verify(transport).quote(argThat(body -> body.at("/pickup/coordinates/latitude").decimalValue().equals(pickup.latitude())
            && body.at("/pickup/coordinates/longitude").decimalValue().equals(pickup.longitude())
            && body.at("/drop/0/location/coordinates/latitude").decimalValue().equals(dropoff.latitude())
            && body.at("/drop/0/location/coordinates/longitude").decimalValue().equals(dropoff.longitude())
            && "500081".equals(body.at("/pickup/pincode").asText())
            && "500032".equals(body.at("/drop/0/location/pincode").asText())
            && !body.path("pickup").has("city")));
        var booking = client.buildOrder("ref-1", aliased);
        assertEquals(pickup.latitude(), booking.at("/sender_detail/address/latitude").decimalValue());
        assertEquals(dropoff.longitude(), booking.at("/trips/0/receiver_detail/address/longitude").decimalValue());
        assertEquals("HYD", booking.at("/sender_detail/address/city").asText());
        verifyNoInteractions(bookings);
    }
    @Test void geographicServiceabilityIsNotAssumedFromMatchingCityLabels() throws Exception {
        QuoteRequest source = request();
        Stop remote = stopWithLocation(source.dropoff(), "Hyderabad", new BigDecimal("28.6139"), new BigDecimal("77.2090"));
        when(transport.quote(any())).thenReturn(mapper.readTree("{\"data\":{\"items\":[]}}"));
        assertFalse(client.quote(withStops(source, source.pickup(), remote)).available());
        verify(transport).quote(any());
        verify(transport, never()).mutate(anyString(), any());
        verifyNoInteractions(bookings);
    }
    @Test void coordinateServiceabilityDoesNotRequireIdenticalAdministrativeCityLabels() throws Exception {
        QuoteRequest source = request();
        Stop dropoff = stopWithLocation(source.dropoff(), "Secunderabad", source.dropoff().latitude(), source.dropoff().longitude());
        when(transport.quote(any())).thenReturn(quote("59", true));
        assertTrue(client.quote(withStops(source, source.pickup(), dropoff)).available());
    }
    @Test void invalidCoordinatesFailBeforeAnyProviderCall() {
        QuoteRequest source = request();
        for (Stop invalid : List.of(
            stopWithLocation(source.pickup(), "HYD", null, new BigDecimal("78.38")),
            stopWithLocation(source.pickup(), "HYD", new BigDecimal("17.44"), null),
            stopWithLocation(source.pickup(), "HYD", new BigDecimal("91"), new BigDecimal("78.38")),
            stopWithLocation(source.pickup(), "HYD", new BigDecimal("17.44"), new BigDecimal("181")),
            stopWithLocation(source.pickup(), "HYD", BigDecimal.ZERO, BigDecimal.ZERO))) {
            assertThrows(IllegalArgumentException.class, () -> client.quote(withStops(source, invalid, source.dropoff())));
            assertThrows(IllegalArgumentException.class, () -> client.quote(withStops(source, source.pickup(), invalid)));
        }
        verifyNoInteractions(transport, bookings);
    }
    @Test void packageAndPrepaidGatesRemainRequired() {
        QuoteRequest source = request();
        assertThrows(IllegalArgumentException.class, () -> client.quote(new QuoteRequest(source.matter(), 0, false,
            source.pickup(), source.dropoff(), source.items(), source.declaredGoodsValue(), "PREPAID", null)));
        assertThrows(IllegalArgumentException.class, () -> client.quote(new QuoteRequest(source.matter(), 500, true,
            source.pickup(), source.dropoff(), source.items(), source.declaredGoodsValue(), "PREPAID", null)));
        assertThrows(IllegalArgumentException.class, () -> client.quote(new QuoteRequest(source.matter(), 500, false,
            source.pickup(), source.dropoff(), source.items(), source.declaredGoodsValue(), "COD", null)));
        verifyNoInteractions(transport, bookings);
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
        assertEquals(900, body.at("/trips/0/packages/0/volumetric_weight").asInt());
        assertEquals(0, body.at("/trips/0/cod_amount").asInt());
        assertEquals("9000000001", body.at("/sender_detail/mobile").asText());
    }
    @Test void quoteAndBookingUseTheSameConfiguredParcelMinimum() {
        properties.setDefaultVolumetricWeightGrams(1200);
        var request = request();
        assertEquals(500, client.buildQuote(request).at("/drop/0/attributes/weight").asInt());
        assertEquals(1200, client.buildQuote(request).at("/drop/0/attributes/volumetric_weight").asInt());
        assertEquals(1200, client.buildOrder("ref-1", request).at("/trips/0/packages/0/volumetric_weight").asInt());
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
