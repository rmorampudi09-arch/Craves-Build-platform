package in.craves.integration.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.PaymentApiProperties;
import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import in.craves.integration.subscription.SubscriptionPaymentModels.CreateSubscriptionPaymentOrderRequest;
import in.craves.integration.subscription.SubscriptionPaymentService;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

@WebMvcTest(SubscriptionPaymentController.class)
@ContextConfiguration(classes = {SubscriptionPaymentController.class, WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class})
class SubscriptionPaymentControllerSecurityTest {
    private static final UUID INVOICE = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final UUID SUBSCRIPTION = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final String INVOICE_ROUTE = "/api/v1/subscription-payments/invoices/" + INVOICE;
    private static final String AUTH = "Bearer fixture-token";
    private static final String BODY = """
        {"customerName":"Fixture Customer","customerPhone":"9876543210",
         "customerEmail":"customer@example.test","returnUrl":"https://craves.test/return"}
        """;
    @Autowired private MockMvc mvc;
    @MockBean private SubscriptionPaymentService service;
    @MockBean private PaymentApiProperties properties;
    @MockBean private JwtVerifier verifier;

    @Test
    void orderCreationReceivesTheVerifiedAuthenticationPrincipal() throws Exception {
        CravesPrincipal customer = principal("CUSTOMER");
        when(verifier.verify("fixture-token")).thenReturn(customer);

        mvc.perform(post(INVOICE_ROUTE + "/orders").header("Authorization", AUTH)
            .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isOk());

        verify(service).createProviderOrder(eq(AUTH), eq(INVOICE), any(CreateSubscriptionPaymentOrderRequest.class), same(customer));
        verify(properties).requireOrderExecutionEnabled();
        verifyNoMoreInteractions(service);
    }

    @Test
    void missingAuthenticationIsPassedAsNullAndServiceDenialIsPreserved() throws Exception {
        when(service.createProviderOrder(isNull(), eq(INVOICE), any(), isNull()))
            .thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Verified customer access token is required"));

        mvc.perform(post(INVOICE_ROUTE + "/orders").contentType(MediaType.APPLICATION_JSON).content(BODY))
            .andExpect(status().isUnauthorized());

        verify(service).createProviderOrder(isNull(), eq(INVOICE), any(), isNull());
        verifyNoInteractions(verifier);
    }

    @Test
    void invalidJwtNeverReachesOrderCreation() throws Exception {
        when(verifier.verify("fixture-token")).thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        mvc.perform(post(INVOICE_ROUTE + "/orders").header("Authorization", AUTH)
            .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isUnauthorized());

        verifyNoInteractions(service, properties);
    }

    @Test
    void adminNewOrderDenialFromServiceIsPreserved() throws Exception {
        CravesPrincipal admin = principal("ADMIN");
        when(verifier.verify("fixture-token")).thenReturn(admin);
        when(service.createProviderOrder(eq(AUTH), eq(INVOICE), any(), same(admin)))
            .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN));

        mvc.perform(post(INVOICE_ROUTE + "/orders").header("Authorization", AUTH)
            .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isForbidden());

        verify(service).createProviderOrder(eq(AUTH), eq(INVOICE), any(), same(admin));
    }

    @Test
    void existingAdminInvoiceAndLatestReadsRemainAvailable() throws Exception {
        when(verifier.verify("fixture-token")).thenReturn(principal("ADMIN"));

        mvc.perform(get(INVOICE_ROUTE).header("Authorization", AUTH)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/subscription-payments/subscriptions/" + SUBSCRIPTION)
            .header("Authorization", AUTH)).andExpect(status().isOk());

        verify(service).getOwned(AUTH, INVOICE);
        verify(service).getLatestOwned(AUTH, SUBSCRIPTION);
        verifyNoMoreInteractions(service);
        verifyNoInteractions(properties);
    }

    @Test
    void disabledOrderExecutionStillBlocksBeforePaymentService() throws Exception {
        when(verifier.verify("fixture-token")).thenReturn(principal("CUSTOMER"));
        doThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE))
            .when(properties).requireOrderExecutionEnabled();

        mvc.perform(post(INVOICE_ROUTE + "/orders").header("Authorization", AUTH)
            .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isServiceUnavailable());

        verifyNoInteractions(service);
    }

    private static CravesPrincipal principal(String role) {
        return new CravesPrincipal(UUID.fromString("55555555-5555-4555-8555-555555555555"), "", Set.of(role));
    }
}
