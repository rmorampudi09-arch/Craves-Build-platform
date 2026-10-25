package in.craves.subscription.credit;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.subscription.config.SecurityConfig;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.security.CravesJwtAuthenticationFilter;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.security.JwtVerifier;
import in.craves.subscription.web.ApiDtos.DayCreditResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(DayCreditController.class)
@Import({SecurityConfig.class, CravesJwtAuthenticationFilter.class})
class DayCreditControllerTest {
    private static final UUID SUBSCRIPTION_ID = UUID.fromString("55555555-5555-4555-8555-555555555555");
    private static final UUID CREDIT_ID = UUID.fromString("66666666-6666-4666-8666-666666666666");
    // Unsigned stand-in: the verifier is mocked, but the admin-session interceptor still decodes the roles claim of a three-part token.
    private static final String TOKEN = "e30." + Base64.getUrlEncoder().withoutPadding()
        .encodeToString("{\"roles\":[\"CUSTOMER\"]}".getBytes(StandardCharsets.UTF_8)) + ".signature";
    private static final CurrentUser CUSTOMER = new CurrentUser(
        UUID.fromString("77777777-7777-4777-8777-777777777777"), "firebase-customer", "+919999999999", List.of("CUSTOMER")
    );
    private static final String PATH = "/api/v1/subscriptions/{subscriptionId}/day-credits/{creditId}/choice";

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private JwtVerifier jwtVerifier;

    @MockBean
    private DayCreditService service;

    @BeforeEach
    void signedInCustomer() {
        when(jwtVerifier.verify(TOKEN)).thenReturn(CUSTOMER);
    }

    @Test
    void customerRequestsARefund() throws Exception {
        when(service.choose(SUBSCRIPTION_ID, CREDIT_ID, "REFUND", CUSTOMER)).thenReturn(new DayCreditResponse(
            CREDIT_ID, "DECLINE", LocalDate.parse("2026-10-14"), LocalDate.parse("2026-10-14"), "LUNCH", null,
            "REFUND_REQUESTED", null, "INR", Instant.parse("2026-10-16T06:00:00Z"), true
        ));

        mockMvc.perform(post(PATH, SUBSCRIPTION_ID, CREDIT_ID).header("Authorization", "Bearer " + TOKEN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"choice\":\"REFUND\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("REFUND_REQUESTED"))
            .andExpect(jsonPath("$.refundAmount").doesNotExist())
            .andExpect(jsonPath("$.extendAvailable").value(true));
    }

    @Test
    void anotherCustomersChoiceIsNotFound() throws Exception {
        when(service.choose(SUBSCRIPTION_ID, CREDIT_ID, "EXTEND", CUSTOMER))
            .thenThrow(ApiException.notFound("DAY_CREDIT_NOT_FOUND", "This choice was not found"));

        mockMvc.perform(post(PATH, SUBSCRIPTION_ID, CREDIT_ID).header("Authorization", "Bearer " + TOKEN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"choice\":\"EXTEND\"}"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("DAY_CREDIT_NOT_FOUND"));
    }

    @Test
    void unknownChoiceIs400() throws Exception {
        mockMvc.perform(post(PATH, SUBSCRIPTION_ID, CREDIT_ID).header("Authorization", "Bearer " + TOKEN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"choice\":\"CASH\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_DAY_CREDIT_CHOICE"));
        verify(service, never()).choose(eq(SUBSCRIPTION_ID), eq(CREDIT_ID), any(), any());
    }

    @Test
    void signInIsRequired() throws Exception {
        mockMvc.perform(post(PATH, SUBSCRIPTION_ID, CREDIT_ID)
                .contentType(MediaType.APPLICATION_JSON).content("{\"choice\":\"REFUND\"}"))
            .andExpect(status().isForbidden());
    }
}
