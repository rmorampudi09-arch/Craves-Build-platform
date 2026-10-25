package in.craves.order.web;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.order.delivery.DeliveryHandoffEligibilityService;
import in.craves.order.delivery.DeliveryHandoffEligibilityService.Eligibility;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class InternalDeliveryHandoffEligibilityControllerTest {
    private final UUID chefSubOrderId = UUID.randomUUID();
    private final UUID checkoutId = UUID.randomUUID();
    private final UUID deliveryJobId = UUID.randomUUID();
    private final String borzoProviderDeliveryId = "borzo-order-1";
    private final DeliveryHandoffEligibilityService service =
        mock(DeliveryHandoffEligibilityService.class);

    @Test
    void authenticatesExactInternalRouteAndReturnsNonCachedEligibility() throws Exception {
        when(service.check(chefSubOrderId, checkoutId, deliveryJobId,
            borzoProviderDeliveryId)).thenReturn(new Eligibility(true));
        var mvc = MockMvcBuilders.standaloneSetup(
            new InternalDeliveryHandoffEligibilityController(service, "unit-secret")).build();

        mvc.perform(request().header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.eligible").value(true));
        verify(service).check(chefSubOrderId, checkoutId, deliveryJobId,
            borzoProviderDeliveryId);
    }

    @Test
    void rejectsMissingOrWrongInternalSecretBeforeReadingOrder() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(
            new InternalDeliveryHandoffEligibilityController(service, "unit-secret")).build();
        mvc.perform(request())
            .andExpect(status().isForbidden());
        mvc.perform(request().header("X-Craves-Internal-Secret", "wrong"))
            .andExpect(status().isForbidden());
        verify(service, never()).check(chefSubOrderId, checkoutId, deliveryJobId,
            borzoProviderDeliveryId);
    }

    @Test
    void returnsFalseWithoutCachingWhenOrderIsNoLongerEligible() throws Exception {
        when(service.check(chefSubOrderId, checkoutId, deliveryJobId,
            borzoProviderDeliveryId)).thenReturn(new Eligibility(false));
        var mvc = MockMvcBuilders.standaloneSetup(
            new InternalDeliveryHandoffEligibilityController(service, "unit-secret")).build();

        mvc.perform(request().header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.eligible").value(false));
    }

    @Test
    void refusesRequestsWhenInternalKeyIsNotConfigured() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(
            new InternalDeliveryHandoffEligibilityController(service, "")).build();

        mvc.perform(request().header("X-Craves-Internal-Secret", "anything"))
            .andExpect(status().isForbidden());
        verify(service, never()).check(chefSubOrderId, checkoutId, deliveryJobId,
            borzoProviderDeliveryId);
    }

    @Test
    void requiresBothProviderIdentifiers() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(
            new InternalDeliveryHandoffEligibilityController(service, "unit-secret")).build();

        mvc.perform(get("/internal/v1/delivery-handoff-eligibility/{id}", chefSubOrderId)
                .param("checkoutId", checkoutId.toString())
                .header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isBadRequest());
        verify(service, never()).check(chefSubOrderId, checkoutId, deliveryJobId,
            borzoProviderDeliveryId);
    }

    private MockHttpServletRequestBuilder request() {
        return get("/internal/v1/delivery-handoff-eligibility/{id}", chefSubOrderId)
            .param("checkoutId", checkoutId.toString())
            .param("deliveryJobId", deliveryJobId.toString())
            .param("borzoProviderDeliveryId", borzoProviderDeliveryId);
    }
}
