package in.craves.subscription.web;

import in.craves.subscription.address.SubscriptionDeliveryAddressClient;
import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.config.SecurityConfig;
import in.craves.subscription.lifecycle.SubscriptionLifecycleService;
import in.craves.subscription.repository.SubscriptionRepository;
import in.craves.subscription.security.CravesJwtAuthenticationFilter;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.security.JwtVerifier;
import in.craves.subscription.service.SubscriptionService;
import in.craves.subscription.web.ApiDtos.SubscriptionResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SubscriptionController.class)
@Import({SecurityConfig.class, CravesJwtAuthenticationFilter.class, SubscriptionService.class})
class SubscriptionPaymentEligibilitySecurityTest {
    @Autowired MockMvc mvc;
    @MockBean JwtVerifier verifier;
    // Live admin-session introspection is covered by its own tests; this slice is strictly offline.
    @MockBean in.craves.subscription.security.AdminSessionRevocationWebConfiguration adminSessions;
    @MockBean SubscriptionRepository repository;
    @MockBean CapacityService capacity;
    @MockBean SubscriptionDeliveryAddressClient addresses;
    @MockBean SubscriptionLifecycleService lifecycle;
    UUID customer = UUID.randomUUID(), subscription = UUID.randomUUID(), address = UUID.randomUUID();

    String path() { return "/api/v1/subscriptions/" + subscription + "/payment-eligibility"; }
    void token(String role) { when(verifier.verify("synthetic-token")).thenReturn(new CurrentUser(customer, "synthetic", "+919999999999", List.of(role))); }
    void owned(UUID owner) {
        when(repository.findSubscriptionById(subscription)).thenReturn(Optional.of(new SubscriptionResponse(subscription, owner,
            UUID.randomUUID(), UUID.randomUUID(), "PENDING_PAYMENT", LocalDate.now(), null, LocalDate.now(), address, null, Instant.now(), Instant.now())));
    }

    @Test void anonymousRequestCannotReachEligibility() throws Exception {
        mvc.perform(get(path()).param("expectedCustomerIdentityId", customer.toString())).andExpect(status().is4xxClientError());
        verifyNoInteractions(repository, addresses, capacity);
    }

    @Test void verifiedCustomerReceivesOnly204() throws Exception {
        token("CUSTOMER"); owned(customer);
        mvc.perform(get(path()).header("Authorization", "Bearer synthetic-token").param("expectedCustomerIdentityId", customer.toString()))
            .andExpect(status().isNoContent()).andExpect(content().string(""));
        verify(verifier).verify("synthetic-token");
        verify(addresses).requireEligible(customer, address);
        verifyNoInteractions(capacity, lifecycle);
    }

    @ParameterizedTest @ValueSource(strings = {"PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN", "CHEF"})
    void administratorOrChefTokenCannotPayForCustomer(String role) throws Exception {
        token(role);
        mvc.perform(get(path()).header("Authorization", "Bearer synthetic-token").param("expectedCustomerIdentityId", customer.toString()))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ROLE_NOT_ALLOWED"));
        verifyNoInteractions(repository, addresses, capacity);
    }

    @Test void queryCannotReplaceVerifiedCustomer() throws Exception {
        token("CUSTOMER");
        mvc.perform(get(path()).header("Authorization", "Bearer synthetic-token").param("expectedCustomerIdentityId", UUID.randomUUID().toString()))
            .andExpect(status().isForbidden());
        verifyNoInteractions(repository, addresses, capacity);
    }

    @Test void foreignStoredOwnerCannotPass() throws Exception {
        token("CUSTOMER"); owned(UUID.randomUUID());
        mvc.perform(get(path()).header("Authorization", "Bearer synthetic-token").param("expectedCustomerIdentityId", customer.toString()))
            .andExpect(status().isForbidden());
        verifyNoInteractions(addresses, capacity);
    }

    @ParameterizedTest @ValueSource(strings = {"", "not-a-uuid"})
    void malformedCustomerQueryIsSafeBadRequest(String expectedCustomer) throws Exception {
        token("CUSTOMER");
        mvc.perform(get(path()).header("Authorization", "Bearer synthetic-token").param("expectedCustomerIdentityId", expectedCustomer))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PAYMENT_CUSTOMER"));
        verifyNoInteractions(repository, addresses, capacity);
    }

    @Test void customerQueryIsRequired() throws Exception {
        token("CUSTOMER");
        mvc.perform(get(path()).header("Authorization", "Bearer synthetic-token")).andExpect(status().isBadRequest());
        verifyNoInteractions(repository, addresses, capacity);
    }
}
