package in.craves.integration.delivery.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.delivery.billing.CourierBilling.Admin;
import in.craves.integration.delivery.billing.CourierBilling.InvoiceInput;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.server.ResponseStatusException;

/** admin-fleet-v1 /courier-billing: who may read and write with the flag on, and that the path is closed with it off. */
class CourierBillingSecurityTest {
    static final String BASE = "/api/v1/admin/fleet/courier-billing";
    static final String INVOICE = "{\"courier\":\"borzo\",\"invoiceRef\":\"INV-1\",\"periodStart\":\"2026-11-01\","
        + "\"periodEnd\":\"2026-11-15\",\"csv\":\"booking_reference,amount,tax,date\\nBZ-1,61.50,,\\n\"}";
    static final String SETTING = "{\"billingMode\":\"UNKNOWN\",\"disputedFeeBorneBy\":\"UNDECIDED\"}";

    static MockHttpServletRequestBuilder as(JwtVerifier verifier, UUID identity, MockHttpServletRequestBuilder request, String role) {
        when(verifier.verify("token-" + role)).thenReturn(new CravesPrincipal(identity, "+919000000000", Set.of(role)));
        return request.header("Authorization", "Bearer token-" + role);
    }

    @Nested
    @WebMvcTest(CourierBillingController.class)
    @ContextConfiguration(classes = {CourierBillingController.class, WebSecurityConfiguration.class, CravesJwtAuthenticationFilter.class})
    @TestPropertySource(properties = "craves.delivery-command.courier-charge-enabled=true")
    class FlagOn {
        @Autowired MockMvc mvc;
        @MockBean CourierBilling billing;
        @MockBean JwtVerifier verifier;
        final UUID identity = UUID.randomUUID();

        @Test
        void paymentsAndPlatformAdminsWriteOperationsAndAuditOnlyReadAndEveryoneElseGetsNothing() throws Exception {
            for (String role : List.of("PLATFORM_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "AUDIT_ADMIN")) {
                mvc.perform(as(verifier, identity, get(BASE + "/settings"), role)).andExpect(status().isOk())
                    .andExpect(header().string("Cache-Control", "no-store"));
                mvc.perform(as(verifier, identity, get(BASE + "/invoices"), role)).andExpect(status().isOk());
            }
            for (String role : List.of("OPERATIONS_ADMIN", "AUDIT_ADMIN", "SUPPORT_ADMIN", "COMPLIANCE_ADMIN", "CHEF", "RIDER", "CUSTOMER")) {
                mvc.perform(as(verifier, identity, post(BASE + "/invoices").contentType(MediaType.APPLICATION_JSON).content(INVOICE), role))
                    .andExpect(status().isForbidden());
                mvc.perform(as(verifier, identity, put(BASE + "/settings/borzo").contentType(MediaType.APPLICATION_JSON).content(SETTING), role))
                    .andExpect(status().isForbidden());
            }
            for (String role : List.of("SUPPORT_ADMIN", "COMPLIANCE_ADMIN", "CHEF", "RIDER", "CUSTOMER")) {
                mvc.perform(as(verifier, identity, get(BASE + "/settings"), role)).andExpect(status().isForbidden());
                mvc.perform(as(verifier, identity, get(BASE + "/invoices/1"), role)).andExpect(status().isForbidden());
            }
            mvc.perform(get(BASE + "/settings")).andExpect(status().isForbidden());
            verify(billing, org.mockito.Mockito.never()).importInvoice(any(), any());
            verify(billing, org.mockito.Mockito.never()).save(any(), any(), any());
        }

        @Test
        void aWriteCarriesTheAdminsIdentityAndRefusalsAreCodeAndMessage() throws Exception {
            mvc.perform(as(verifier, identity, post(BASE + "/invoices").contentType(MediaType.APPLICATION_JSON).content(INVOICE), "PAYMENTS_ADMIN"))
                .andExpect(status().isOk());
            ArgumentCaptor<Admin> admin = ArgumentCaptor.forClass(Admin.class);
            ArgumentCaptor<InvoiceInput> input = ArgumentCaptor.forClass(InvoiceInput.class);
            verify(billing).importInvoice(admin.capture(), input.capture());
            assertThat(admin.getValue().id()).isEqualTo(identity);
            assertThat(admin.getValue().name()).as("the phone is masked").doesNotContain("9000000000");
            assertThat(input.getValue().periodEnd()).hasToString("2026-11-15");

            when(billing.save(any(), eq("borzo"), any())).thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "billingMode must be X"));
            mvc.perform(as(verifier, identity, put(BASE + "/settings/borzo").contentType(MediaType.APPLICATION_JSON).content(SETTING),
                "PLATFORM_ADMIN")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("billingMode must be X"));
            mvc.perform(as(verifier, identity, post(BASE + "/invoices").contentType(MediaType.APPLICATION_JSON).content("{\"periodStart\":\"x\"}"),
                "PLATFORM_ADMIN")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
            mvc.perform(as(verifier, identity, get(BASE + "/invoices/abc"), "PLATFORM_ADMIN")).andExpect(status().isBadRequest());
        }
    }

    @Nested
    @WebMvcTest(CourierBillingController.class)
    @ContextConfiguration(classes = {CourierBillingController.class, CourierBilling.class, WebSecurityConfiguration.class,
        CravesJwtAuthenticationFilter.class})
    class FlagOff {
        @Autowired MockMvc mvc;
        @Autowired ApplicationContext context;
        @MockBean JwtVerifier verifier;

        @Test
        void withTheFlagOffTheRoutesDoNotExistAndThePathIsClosedToEveryAdmin() throws Exception {
            assertThat(context.getBeanNamesForType(CourierBillingController.class)).isEmpty();
            assertThat(context.getBeanNamesForType(CourierBilling.class)).isEmpty();
            for (String role : List.of("PLATFORM_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "AUDIT_ADMIN")) {
                mvc.perform(as(verifier, UUID.randomUUID(), get(BASE + "/settings"), role)).andExpect(status().isForbidden());
                mvc.perform(as(verifier, UUID.randomUUID(), post(BASE + "/invoices").contentType(MediaType.APPLICATION_JSON).content(INVOICE),
                    role)).andExpect(status().isForbidden());
            }
        }
    }
}
