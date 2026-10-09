package in.craves.subscription.service;

import in.craves.subscription.address.SubscriptionDeliveryAddressClient;
import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.lifecycle.SubscriptionLifecycleService;
import in.craves.subscription.repository.SubscriptionRepository;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.web.ApiDtos.CreateSubscriptionRequest;
import in.craves.subscription.web.ApiDtos.SubscriptionResponse;
import in.craves.subscription.web.SubscriptionController;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SubscriptionAddressEligibilityTest {
    final UUID customerId = UUID.randomUUID(), addressId = UUID.randomUUID(), subscriptionId = UUID.randomUUID(), planId = UUID.randomUUID();
    final CurrentUser customer = user(customerId, "CUSTOMER");
    final SubscriptionRepository repository = mock(SubscriptionRepository.class);
    final CapacityService capacity = mock(CapacityService.class);
    final SubscriptionDeliveryAddressClient addresses = mock(SubscriptionDeliveryAddressClient.class);
    final SubscriptionService service = new SubscriptionService(repository, capacity, addresses);
    final LocalDate start = LocalDate.now().plusDays(2);

    CurrentUser user(UUID id, String role) { return new CurrentUser(id, "synthetic", "+919999999999", List.of(role)); }
    SubscriptionResponse stored(String status, UUID owner) {
        return new SubscriptionResponse(subscriptionId, owner, planId, UUID.randomUUID(), status, start, null,
            start, addressId, null, Instant.now(), Instant.now());
    }
    CreateSubscriptionRequest request() { return new CreateSubscriptionRequest(planId, start, addressId, null); }

    @Test void pendingReplayRechecksBeforeReacquiringCapacity() {
        var existing = stored("PENDING_PAYMENT", customerId);
        when(repository.findSubscriptionByEnrollmentKey(customerId, "cp03-pending")).thenReturn(Optional.of(existing));
        doThrow(ApiException.notFound("DELIVERY_ADDRESS_NOT_AVAILABLE", "synthetic")).when(addresses).requireEligible(customerId, addressId);
        assertThrows(ApiException.class, () -> service.createSubscription(request(), "cp03-pending", customer));
        verifyNoInteractions(capacity);
        verify(repository, never()).createSubscription(any(), any(), any(), any(), any(), any());
    }

    @Test void eligiblePendingReplayReacquiresHoldOnlyAfterCheck() {
        var existing = stored("PENDING_PAYMENT", customerId);
        when(repository.findSubscriptionByEnrollmentKey(customerId, "cp03-pending")).thenReturn(Optional.of(existing));
        service.createSubscription(request(), "cp03-pending", customer);
        var order = inOrder(addresses, capacity);
        order.verify(addresses).requireEligible(customerId, addressId);
        order.verify(capacity).acquireEnrollmentHold(existing);
    }

    @ParameterizedTest @ValueSource(strings = {"ACTIVE", "PAUSED", "CANCELLED", "EXPIRED", "PAYMENT_FAILED"})
    void establishedReplayDoesNotDependOnAddressService(String status) {
        when(repository.findSubscriptionByEnrollmentKey(customerId, "cp03-established")).thenReturn(Optional.of(stored(status, customerId)));
        assertEquals(status, service.createSubscription(request(), "cp03-established", customer).status());
        verifyNoInteractions(addresses, capacity);
    }

    @Test void paymentCheckUsesStoredAddressAndReturnsNoData() {
        when(repository.findSubscriptionById(subscriptionId)).thenReturn(Optional.of(stored("PENDING_PAYMENT", customerId)));
        var controller = new SubscriptionController(service, mock(SubscriptionLifecycleService.class));
        var response = controller.paymentEligibility(subscriptionId, customerId.toString(), customer);
        assertEquals(204, response.getStatusCode().value());
        assertNull(response.getBody());
        verify(addresses).requireEligible(customerId, addressId);
        verifyNoInteractions(capacity);
    }

    @Test void expectedCustomerMustMatchAuthenticatedIdentity() {
        assertEquals(403, assertThrows(ApiException.class, () -> service.requirePaymentEligibility(subscriptionId, UUID.randomUUID(), customer)).getStatus());
        verifyNoInteractions(repository, addresses, capacity);
    }

    @Test void foreignSubscriptionDoesNotReachAddressLookup() {
        when(repository.findSubscriptionById(subscriptionId)).thenReturn(Optional.of(stored("PENDING_PAYMENT", UUID.randomUUID())));
        assertEquals(403, assertThrows(ApiException.class, () -> service.requirePaymentEligibility(subscriptionId, customerId, customer)).getStatus());
        verifyNoInteractions(addresses, capacity);
    }

    @Test void missingSubscriptionDoesNotReachAddressLookup() {
        when(repository.findSubscriptionById(subscriptionId)).thenReturn(Optional.empty());
        assertEquals(404, assertThrows(ApiException.class, () -> service.requirePaymentEligibility(subscriptionId, customerId, customer)).getStatus());
        verifyNoInteractions(addresses, capacity);
    }

    @ParameterizedTest @ValueSource(strings = {"PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN", "CHEF"})
    void nonCustomerCannotUsePaymentEligibility(String role) {
        assertEquals(403, assertThrows(ApiException.class, () -> service.requirePaymentEligibility(subscriptionId, customerId, user(customerId, role))).getStatus());
        verifyNoInteractions(repository, addresses, capacity);
    }

    @Test void anonymousPaymentEligibilityIsDenied() {
        assertEquals(403, assertThrows(ApiException.class, () -> service.requirePaymentEligibility(subscriptionId, customerId, null)).getStatus());
        verifyNoInteractions(repository, addresses, capacity);
    }

    @ParameterizedTest @ValueSource(strings = {"PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN"})
    void administratorDetailReadKeepsExistingOwnershipExemption(String role) {
        when(repository.findSubscriptionById(subscriptionId)).thenReturn(Optional.of(stored("ACTIVE", customerId)));
        assertEquals(subscriptionId, service.getMine(subscriptionId, user(UUID.randomUUID(), role)).id());
        verifyNoInteractions(addresses, capacity);
    }

    @Test void customerReadDoesNotDependOnAddressAvailability() {
        when(repository.findSubscriptionById(subscriptionId)).thenReturn(Optional.of(stored("ACTIVE", customerId)));
        assertEquals(subscriptionId, service.getMine(subscriptionId, customer).id());
        verifyNoInteractions(addresses, capacity);
    }
}
