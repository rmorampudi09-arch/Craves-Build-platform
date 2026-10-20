package in.craves.order.web;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.order.delivery.DeliveryCodeService;
import in.craves.order.delivery.DeliveryCodeService.Outcome;
import in.craves.order.delivery.DeliveryCodeService.Verification;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class InternalDeliveryCodeControllerTest {
    private final UUID orderId = UUID.randomUUID();
    private final DeliveryCodeService service = mock(DeliveryCodeService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(
        new InternalDeliveryCodeController(service, "unit-secret")).build();

    @Test
    void rightCodeIsVerifiedWithoutCaching() throws Exception {
        when(service.verify(orderId, "0427")).thenReturn(new Verification(Outcome.VERIFIED, 0));

        mvc.perform(request("0427").header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.verified").value(true));
        verify(service).verify(orderId, "0427");
    }

    @Test
    void wrongCodeSaysHowManyTriesAreLeftAndNeverEchoesACode() throws Exception {
        when(service.verify(orderId, "1111")).thenReturn(new Verification(Outcome.INVALID, 3));

        mvc.perform(request("1111").header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("DELIVERY_CODE_INVALID"))
            .andExpect(jsonPath("$.attemptsLeft").value(3))
            .andExpect(jsonPath("$.verified").doesNotExist());
    }

    @Test
    void lockedAfterFiveWrongCodes() throws Exception {
        when(service.verify(orderId, "0427")).thenReturn(new Verification(Outcome.LOCKED, 0));

        mvc.perform(request("0427").header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isLocked())
            .andExpect(jsonPath("$.code").value("DELIVERY_CODE_LOCKED"));
    }

    @Test
    void alreadyVerifiedCodeStaysVerified() throws Exception {
        when(service.verify(orderId, "9999")).thenReturn(new Verification(Outcome.VERIFIED, 0));

        mvc.perform(request("9999").header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.verified").value(true));
    }

    @Test
    void unknownOrderIsNotFound() throws Exception {
        when(service.verify(orderId, "0427")).thenReturn(new Verification(Outcome.NOT_FOUND, 0));

        mvc.perform(request("0427").header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isNotFound());
    }

    @Test
    void missingWrongOrUnconfiguredSecretIsForbiddenBeforeTouchingTheCode() throws Exception {
        mvc.perform(request("0427"))
            .andExpect(status().isForbidden());
        mvc.perform(request("0427").header("X-Craves-Internal-Secret", "wrong"))
            .andExpect(status().isForbidden());
        MockMvcBuilders.standaloneSetup(new InternalDeliveryCodeController(service, "")).build()
            .perform(request("0427").header("X-Craves-Internal-Secret", ""))
            .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    private MockHttpServletRequestBuilder request(String code) {
        return post("/internal/v1/orders/{orderId}/delivery-code/verify", orderId)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"code\":\"" + code + "\"}");
    }
}
