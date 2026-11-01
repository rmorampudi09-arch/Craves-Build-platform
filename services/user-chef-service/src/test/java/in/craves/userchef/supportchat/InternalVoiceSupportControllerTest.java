package in.craves.userchef.supportchat;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.userchef.config.AuthInternalClientProperties;
import in.craves.userchef.exception.AppErrorHandler;
import in.craves.userchef.security.InternalRequestAuthorizer;
import in.craves.userchef.supportchat.SupportChatController.SupportCaseRef;
import in.craves.userchef.supportchat.VoiceSupportService.Caller;
import in.craves.userchef.supportchat.VoiceSupportService.CallerContext;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class InternalVoiceSupportControllerTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final VoiceSupportService voice = mock(VoiceSupportService.class);
    private final MockMvc mvc;

    InternalVoiceSupportControllerTest() {
        AuthInternalClientProperties properties = new AuthInternalClientProperties();
        properties.setServiceSecret("unit-secret");
        mvc = MockMvcBuilders.standaloneSetup(new InternalVoiceSupportController(voice, new InternalRequestAuthorizer(properties)))
            .setControllerAdvice(new AppErrorHandler())
            .build();
    }

    @Test
    void contextNamesTheCallerAndKeepsTheIdentityIdInside() throws Exception {
        var orders = objectMapper.createArrayNode();
        orders.addObject().put("kitchenName", "Amma's Kitchen").put("status", "PREPARING");
        when(voice.context("09876543210")).thenReturn(new CallerContext(
            new Caller(UUID.randomUUID(), "CUSTOMER", "Lakshmi", null, null), orders));

        mvc.perform(get("/internal/v1/support/voice/context").param("phone", "09876543210")
                .header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.caller.firstName").value("Lakshmi"))
            .andExpect(jsonPath("$.caller.role").value("CUSTOMER"))
            .andExpect(jsonPath("$.caller.identityId").doesNotExist())
            .andExpect(jsonPath("$.orders[0].kitchenName").value("Amma's Kitchen"));
    }

    @Test
    void unknownCallerIsNullWithNoOrders() throws Exception {
        when(voice.context("9000000000")).thenReturn(new CallerContext(null, objectMapper.createArrayNode()));

        mvc.perform(get("/internal/v1/support/voice/context").param("phone", "9000000000")
                .header("X-Craves-Internal-Secret", "unit-secret"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.caller").doesNotExist())
            .andExpect(jsonPath("$.orders").isEmpty());
    }

    @Test
    void missingOrWrongSecretIsRejectedBeforeAnyLookup() throws Exception {
        mvc.perform(get("/internal/v1/support/voice/context").param("phone", "9876543210"))
            .andExpect(status().isUnauthorized());
        mvc.perform(get("/internal/v1/support/voice/context").param("phone", "9876543210")
                .header("X-Craves-Internal-Secret", "wrong"))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/internal/v1/support/voice/tickets").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\":\"9876543210\",\"subject\":\"x\",\"details\":\"y\"}"))
            .andExpect(status().isUnauthorized());
        verifyNoInteractions(voice);
    }

    @Test
    void ticketReturnsTheCaseNumberAndRejectsEmptyFields() throws Exception {
        when(voice.openTicket("9876543210", "Refund", "Refund for Monday's order not received", "Ravi", "Telugu"))
            .thenReturn(new SupportCaseRef(UUID.randomUUID(), "CRV-42"));

        mvc.perform(post("/internal/v1/support/voice/tickets").contentType(MediaType.APPLICATION_JSON)
                .header("X-Craves-Internal-Secret", "unit-secret")
                .content("{\"phone\":\"9876543210\",\"subject\":\"Refund\",\"details\":\"Refund for Monday's order not received\","
                    + "\"callerName\":\"Ravi\",\"language\":\"Telugu\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.caseNumber").value("CRV-42"));

        mvc.perform(post("/internal/v1/support/voice/tickets").contentType(MediaType.APPLICATION_JSON)
                .header("X-Craves-Internal-Secret", "unit-secret")
                .content("{\"phone\":\"9876543210\",\"subject\":\"\",\"details\":\"y\"}"))
            .andExpect(status().isBadRequest());
        verify(voice).openTicket("9876543210", "Refund", "Refund for Monday's order not received", "Ravi", "Telugu");
    }

    @Test
    void tooManyTicketsAnswers429WithRetryAfter() throws Exception {
        when(voice.openTicket(any(), any(), any(), any(), any())).thenThrow(new SupportChatLimiter.Limited(30, false));

        mvc.perform(post("/internal/v1/support/voice/tickets").contentType(MediaType.APPLICATION_JSON)
                .header("X-Craves-Internal-Secret", "unit-secret")
                .content("{\"phone\":\"9876543210\",\"subject\":\"x\",\"details\":\"y\"}"))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().string("Retry-After", "30"))
            .andExpect(jsonPath("$.code").value("VOICE_TICKET_RATE_LIMITED"));
    }
}
