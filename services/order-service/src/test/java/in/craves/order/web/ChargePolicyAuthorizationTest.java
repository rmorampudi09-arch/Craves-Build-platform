package in.craves.order.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.CatalogClient;
import in.craves.order.service.CheckoutSnapshotFactory;
import in.craves.order.service.CustomerAddressClient;
import in.craves.order.service.NotificationInternalClient;
import in.craves.order.service.OrderService;
import in.craves.order.web.ApiDtos.ChargePolicyResponse;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class ChargePolicyAuthorizationTest {
    private static final String ROUTE = "/api/v1/admin/charge-policy";

    @AfterEach
    void signOut() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void chargePolicyReadIsGatedBeforeTheService() throws Exception {
        OrderService orders = mock(OrderService.class);
        MockMvc mvc = mvc(orders);
        for (Set<String> roles : List.of(Set.of("CUSTOMER", "ADMIN"), Set.of("CHEF_ADMIN"), Set.of("CUSTOMER"))) {
            actor(roles);
            mvc.perform(get(ROUTE + "/current")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("ROLE_REQUIRED"));
        }
        verifyNoInteractions(orders);

        for (String role : List.of("PLATFORM_ADMIN", "PAYMENTS_ADMIN", "AUDIT_ADMIN")) {
            actor(Set.of(role));
            mvc.perform(get(ROUTE + "/current")).andExpect(status().isOk());
        }
        verify(orders, times(3)).currentChargePolicy();
    }

    @Test
    @SuppressWarnings("unchecked")
    void onlyPlatformAndPaymentsAdminsChangeChargePolicy() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(anyString(), any(RowMapper.class))).thenReturn(List.of(new ChargePolicyResponse(
            UUID.randomUUID(), "ACTIVE", BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, true, null)));
        MockMvc mvc = mvc(new OrderService(jdbc, mock(CatalogClient.class), mock(CustomerAddressClient.class),
            new CheckoutSnapshotFactory(), mock(NotificationInternalClient.class)));
        for (Set<String> roles : List.of(Set.of("CUSTOMER", "ADMIN"), Set.of("CHEF_ADMIN"), Set.of("CUSTOMER"), Set.of("AUDIT_ADMIN"))) {
            actor(roles);
            mvc.perform(create()).andExpect(status().isForbidden());
        }
        verifyNoInteractions(jdbc);

        actor(Set.of("PAYMENTS_ADMIN"));
        mvc.perform(create()).andExpect(status().isOk());
        verify(jdbc).update("UPDATE order_schema.charge_policy SET is_active = false WHERE is_active = true");
    }

    private static MockMvc mvc(OrderService orders) {
        return MockMvcBuilders.standaloneSetup(new AdminChargePolicyController(orders))
            .setControllerAdvice(new OrderApiExceptionHandler())
            .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
            .build();
    }

    private static void actor(Set<String> roles) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
            new CravesPrincipal(UUID.randomUUID(), "+10000000000", roles), null, List.of()));
    }

    private static MockHttpServletRequestBuilder create() {
        return post(ROUTE).contentType(MediaType.APPLICATION_JSON)
            .content("{\"platformFeePercent\":0,\"taxPercent\":0,\"deliveryFeeFlat\":0}");
    }
}
