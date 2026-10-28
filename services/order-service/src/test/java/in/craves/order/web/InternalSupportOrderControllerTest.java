package in.craves.order.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.OrderHistoryService;
import in.craves.order.web.OrderHistoryDtos.OrderPageResponse;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class InternalSupportOrderControllerTest {
    private final UUID identityId = UUID.randomUUID();
    private final OrderHistoryService history = mock(OrderHistoryService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(
        new InternalSupportOrderController(history, "unit-secret")).build();

    @Test
    void customerOrdersComeFromTheSameHistoryPathAsTheApp() throws Exception {
        when(history.listCustomerOrders(any(), eq(5), isNull(), isNull()))
            .thenReturn(new OrderPageResponse(List.of(), null, false));

        mvc.perform(request("CUSTOMER").header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.orders").isArray())
            .andExpect(jsonPath("$.hasMore").value(false));

        ArgumentCaptor<CravesPrincipal> principal = ArgumentCaptor.forClass(CravesPrincipal.class);
        verify(history).listCustomerOrders(principal.capture(), eq(5), isNull(), isNull());
        org.junit.jupiter.api.Assertions.assertEquals(identityId, principal.getValue().identityId());
        org.junit.jupiter.api.Assertions.assertTrue(principal.getValue().hasRole("CUSTOMER"));
        org.junit.jupiter.api.Assertions.assertFalse(principal.getValue().hasRole("CHEF"));
    }

    @Test
    void chefRoleUsesTheChefHistory() throws Exception {
        when(history.listChefOrders(any(), eq(3), isNull(), isNull()))
            .thenReturn(new OrderPageResponse(List.of(), null, false));

        mvc.perform(request("chef").param("limit", "3").header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isOk());
        verify(history).listChefOrders(any(), eq(3), isNull(), isNull());
    }

    @Test
    void missingWrongOrUnconfiguredSecretIsForbiddenBeforeReadingAnything() throws Exception {
        mvc.perform(request("CUSTOMER")).andExpect(status().isForbidden());
        mvc.perform(request("CUSTOMER").header("X-Craves-Internal-Secret", "wrong")).andExpect(status().isForbidden());

        MockMvc unconfigured = MockMvcBuilders.standaloneSetup(new InternalSupportOrderController(history, "")).build();
        unconfigured.perform(request("CUSTOMER").header("X-Craves-Internal-Secret", ""))
            .andExpect(status().isForbidden());
        verifyNoInteractions(history);
    }

    @Test
    void otherRolesAndOversizedPagesAreRejected() throws Exception {
        mvc.perform(request("ADMIN").header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isBadRequest());
        mvc.perform(request("CUSTOMER").param("limit", "11").header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(history);
    }

    private MockHttpServletRequestBuilder request(String role) {
        return get("/internal/v1/support/orders")
            .param("identityId", identityId.toString())
            .param("role", role);
    }
}
