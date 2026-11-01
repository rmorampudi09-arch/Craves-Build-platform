package in.craves.userchef.supportchat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.userchef.config.AuthInternalClientProperties;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.SupportCaseService;
import in.craves.userchef.web.SupportCaseDtos.CreateSupportCaseRequest;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseDetailResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseSummaryResponse;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

class VoiceSupportServiceTest {
    private static final UUID CHEF_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID CUSTOMER_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final SupportOrderClient orders = mock(SupportOrderClient.class);
    private final SupportCaseService supportCases = mock(SupportCaseService.class);
    private final AuthInternalClientProperties internal = new AuthInternalClientProperties();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final VoiceSupportService service;

    VoiceSupportServiceTest() {
        internal.setServiceSecret("shared-secret");
        service = new VoiceSupportService(jdbc, orders, supportCases, new SupportChatLimiter(), internal, objectMapper);
    }

    @Test
    void phoneSpellingsNormaliseToTenDigitsAndJunkIsRejected() {
        for (String spelling : List.of("9876543210", "09876543210", "+919876543210", "919876543210", "+91 98765-43210")) {
            assertEquals("9876543210", VoiceSupportService.normalizePhone(spelling), spelling);
        }
        for (String junk : List.of("", "12345", "1234567890", "+1 415 555 0100", "abc", "")) {
            assertNull(VoiceSupportService.normalizePhone(junk), junk);
        }
        assertNull(VoiceSupportService.normalizePhone(null));
    }

    @Test
    void unknownNumberHasNoCallerAndTouchesNoOrders() {
        stubChefs(List.of());
        stubCustomers(List.of());

        var context = service.context("09876543210");

        assertNull(context.caller());
        assertEquals(0, context.orders().size());
        verifyNoInteractions(orders);
    }

    @Test
    void customerGetsHerOwnRecentOrdersThroughTheInternalRoute() {
        stubChefs(List.of());
        stubCustomers(List.of(Map.of("identity_id", CUSTOMER_ID, "first_name", "Lakshmi")));
        var recent = objectMapper.createArrayNode();
        recent.addObject().put("status", "OUT_FOR_DELIVERY");
        when(orders.recentOrdersForPhoneCall("shared-secret", CUSTOMER_ID, false, VoiceSupportService.RECENT_ORDERS))
            .thenReturn(recent);

        var context = service.context("+919876543210");

        assertEquals("CUSTOMER", context.caller().role());
        assertEquals("Lakshmi", context.caller().firstName());
        assertEquals(1, context.orders().size());
    }

    @Test
    void approvedChefWinsOverHerCustomerProfileAndApplicantGetsNoOrderLookup() {
        stubChefs(List.of(Map.of("identity_id", CHEF_ID, "first_name", "Padma", "status", "APPROVED", "review_status", "PENDING")));
        stubCustomers(List.of(Map.of("identity_id", CUSTOMER_ID, "first_name", "Padma")));
        when(orders.recentOrdersForPhoneCall("shared-secret", CHEF_ID, true, VoiceSupportService.RECENT_ORDERS))
            .thenReturn(objectMapper.createArrayNode());

        var chef = service.context("9876543210");
        assertEquals("CHEF", chef.caller().role());
        assertEquals("APPROVED", chef.caller().applicationStatus());
        verify(orders).recentOrdersForPhoneCall("shared-secret", CHEF_ID, true, VoiceSupportService.RECENT_ORDERS);

        stubChefs(List.of(Map.of("identity_id", CHEF_ID, "first_name", "Padma", "status", "PENDING", "review_status", "UNDER_REVIEW")));
        stubCustomers(List.of());

        var applicant = service.context("9876543210");
        assertEquals("CHEF", applicant.caller().role());
        assertEquals("UNDER_REVIEW", applicant.caller().reviewStatus());
        assertEquals(0, applicant.orders().size());
        verify(orders, never()).recentOrdersForPhoneCall(anyString(), eq(CHEF_ID), eq(false), eq(VoiceSupportService.RECENT_ORDERS));
    }

    @Test
    void orderLookupOutageStillIdentifiesTheCaller() {
        stubChefs(List.of());
        stubCustomers(List.of(Map.of("identity_id", CUSTOMER_ID, "first_name", "Lakshmi")));
        when(orders.recentOrdersForPhoneCall(anyString(), any(), eq(false), eq(VoiceSupportService.RECENT_ORDERS)))
            .thenThrow(new ApiException(503, "ORDER_LOOKUP_UNAVAILABLE", "down"));

        var context = service.context("9876543210");

        assertEquals("Lakshmi", context.caller().firstName());
        assertEquals(0, context.orders().size());
    }

    @Test
    void unknownCallerGetsAGuestTicketCarryingTheNumberAndMaskedText() {
        stubChefs(List.of());
        stubCustomers(List.of());
        when(supportCases.createGuest(anyString(), anyString())).thenReturn(summary("CRV-1"));

        var ticket = service.openTicket("09876543210", "Refund not received", "Paid 4111111111111111 on Monday", "Ravi", "Telugu");

        assertEquals("CRV-1", ticket.caseNumber());
        ArgumentCaptor<String> message = ArgumentCaptor.forClass(String.class);
        verify(supportCases).createGuest(eq("Call: Refund not received"), message.capture());
        assertTrue(message.getValue().contains("Caller's number: 9876543210"));
        assertTrue(message.getValue().contains("Name given on the call: Ravi"));
        assertTrue(message.getValue().contains("Language of the call: Telugu"));
        assertTrue(message.getValue().contains("[number removed]"));
        assertTrue(!message.getValue().contains("4111111111111111"));
        verify(supportCases, never()).create(any(), any());
    }

    @Test
    void knownCallerGetsATicketOnTheirOwnAccount() {
        stubChefs(List.of());
        stubCustomers(List.of(Map.of("identity_id", CUSTOMER_ID, "first_name", "Lakshmi")));
        when(supportCases.create(any(), any())).thenReturn(new SupportCaseDetailResponse(summary("CRV-2"), List.of(), List.of()));

        var ticket = service.openTicket("9876543210", "Order late", "Order placed at 7 still not here", null, "Hindi");

        assertEquals("CRV-2", ticket.caseNumber());
        ArgumentCaptor<CurrentUser> user = ArgumentCaptor.forClass(CurrentUser.class);
        ArgumentCaptor<CreateSupportCaseRequest> request = ArgumentCaptor.forClass(CreateSupportCaseRequest.class);
        verify(supportCases).create(user.capture(), request.capture());
        assertEquals(CUSTOMER_ID, user.getValue().identityId());
        assertTrue(user.getValue().hasRole("CUSTOMER"));
        assertEquals("CUSTOMER", request.getValue().contextRole());
        assertEquals("Call: Order late", request.getValue().subject());
        assertTrue(request.getValue().message().startsWith(VoiceSupportService.TICKET_PREFIX));
        verify(supportCases, never()).createGuest(anyString(), anyString());
    }

    @Test
    void aNumberCannotOpenMoreThanThreeTicketsADayAndBadInputNeverReachesTheDatabase() {
        stubChefs(List.of());
        stubCustomers(List.of());
        when(supportCases.createGuest(anyString(), anyString())).thenReturn(summary("CRV-3"));

        service.openTicket("9876543210", "a", "b", null, null);
        service.openTicket("9876543210", "a", "b", null, null);
        assertThrows(SupportChatLimiter.Limited.class, () -> service.openTicket("9876543210", "a", "b", null, null));

        ApiException invalid = assertThrows(ApiException.class, () -> service.openTicket("12345", "a", "b", null, null));
        assertEquals("VOICE_PHONE_INVALID", invalid.getCode());
        ApiException empty = assertThrows(ApiException.class, () -> service.openTicket("9876543211", " ", "b", null, null));
        assertEquals("VOICE_TICKET_INVALID", empty.getCode());
    }

    private void stubChefs(List<Map<String, Object>> rows) {
        when(jdbc.queryForList(contains("chef_application"), eq("9876543210"), eq("919876543210"), eq("+919876543210")))
            .thenReturn(rows);
    }

    private void stubCustomers(List<Map<String, Object>> rows) {
        when(jdbc.queryForList(contains("customer_profile"), eq("9876543210"), eq("919876543210"), eq("+919876543210")))
            .thenReturn(rows);
    }

    private static SupportCaseSummaryResponse summary(String caseNumber) {
        return new SupportCaseSummaryResponse(UUID.randomUUID(), caseNumber, null, "GUEST", null, "Call: x",
            in.craves.userchef.support.SupportCaseStatus.OPEN, null, Instant.now(), null, null, null, Instant.now(), Instant.now());
    }
}
