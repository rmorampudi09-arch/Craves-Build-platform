package in.craves.notification.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.notification.delivery.RealtimePushSender;
import in.craves.notification.delivery.RealtimePushSender.Push;
import in.craves.notification.delivery.RealtimePushSender.Result;
import in.craves.notification.email.VerificationEmailTransport;
import in.craves.notification.email.VerificationEmailTransport.Outcome;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class InternalRealtimeControllerTest {
    private static final String KEY = "unit-test-internal-key";
    private static final String OFFER = """
        {"app":"rider","token":"rider-token-1","data":{"type":"OFFER","offerId":"offer-7"},
         "notification":{"title":"New order","body":"Rs 62 for 3.1 km"},"ttlSeconds":38,"collapseKey":"rider_offer"}""";
    private static final String SOS = """
        {"kind":"SOS","title":"Rider SOS","body":"Ravi pressed SOS","data":{"riderId":"r-1","lat":"17.44"}}""";

    private final RealtimePushSender sender = mock(RealtimePushSender.class);
    private final VerificationEmailTransport email = mock(VerificationEmailTransport.class);

    @Test
    void bothRoutesRefuseAMissingOrWrongInternalKey() throws Exception {
        MockMvc mvc = mvc(sender, "ops@craves.test");
        for (String[] route : new String[][] {{"/internal/v1/push/realtime", OFFER}, {"/internal/v1/ops-alerts", SOS}}) {
            mvc.perform(json(route[0], route[1])).andExpect(status().isForbidden());
            mvc.perform(json(route[0], route[1]).header("X-Craves-Internal-Key", "wrong-key")).andExpect(status().isForbidden());
        }
        verifyNoInteractions(sender, email);
    }

    @Test
    void realtimePushIsRefusedWhileTheFlagIsOff() throws Exception {
        mvc(null, "").perform(authed("/internal/v1/push/realtime", OFFER))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.code").value("PUSH_DISABLED"));
    }

    @Test
    void realtimePushSendsTheOfferAndReturnsTheMessageId() throws Exception {
        when(sender.send(any())).thenReturn(new Result("projects/craves/messages/1", null));

        mvc(sender, "").perform(authed("/internal/v1/push/realtime", OFFER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.messageId").value("projects/craves/messages/1"));

        ArgumentCaptor<Push> push = ArgumentCaptor.forClass(Push.class);
        verify(sender).send(push.capture());
        assertThat(push.getValue()).isEqualTo(new Push("rider", "rider-token-1",
            Map.of("type", "OFFER", "offerId", "offer-7"), "New order", "Rs 62 for 3.1 km", 38, "rider_offer"));
    }

    @Test
    void realtimePushPassesTheFcmErrorCodeToTheCaller() throws Exception {
        when(sender.send(any())).thenReturn(new Result(null, "TOKEN_UNREGISTERED"));

        mvc(sender, "").perform(authed("/internal/v1/push/realtime", OFFER))
            .andExpect(status().isBadGateway())
            .andExpect(jsonPath("$.code").value("TOKEN_UNREGISTERED"));
    }

    @Test
    void realtimePushRejectsWhatFcmWouldRefuseOrRingLate() throws Exception {
        MockMvc mvc = mvc(sender, "");
        for (String body : new String[] {
            OFFER.replace("\"rider\"", "\"customer\""),
            OFFER.replace("38", "0"),
            OFFER.replace("38", "601"),
            OFFER.replace("\"type\":\"OFFER\",", ""),
            OFFER.replace("\"offerId\"", "\"google.offer\""),
            OFFER.replace("\"offerId\"", "\"title\""),
            OFFER.replace("\"title\":\"New order\",", ""),
            OFFER.replace("offer-7", "x".repeat(1001)),
            OFFER.replace("\"offerId\":\"offer-7\"", "\"a\":\"" + "x".repeat(900) + "\",\"b\":\"" + "x".repeat(900)
                + "\",\"c\":\"" + "x".repeat(900) + "\",\"d\":\"" + "x".repeat(900) + "\""),
        }) {
            mvc.perform(authed("/internal/v1/push/realtime", body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
        verifyNoInteractions(sender);
    }

    @Test
    void opsAlertNeedsConfiguredRecipientsAndEmail() throws Exception {
        mvc(sender, "").perform(authed("/internal/v1/ops-alerts", SOS))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.code").value("OPS_ALERT_NOT_CONFIGURED"));

        when(email.configured()).thenReturn(false);
        mvc(sender, "ops@craves.test").perform(authed("/internal/v1/ops-alerts", SOS))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.code").value("OPS_ALERT_NOT_CONFIGURED"));
        verify(email, org.mockito.Mockito.never()).sendPlainText(anyList(), anyString(), anyString());
    }

    @Test
    void opsAlertEmailsEveryConfiguredOpsLeadAtOnce() throws Exception {
        when(email.configured()).thenReturn(true);
        when(email.sendPlainText(anyList(), anyString(), anyString())).thenReturn(Outcome.ACCEPTED);

        mvc(sender, "lead@craves.test, backup@craves.test").perform(authed("/internal/v1/ops-alerts", SOS))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.recipients").value(2));

        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(email).sendPlainText(eq(List.of("lead@craves.test", "backup@craves.test")), eq("Craves SOS: Rider SOS"), text.capture());
        assertThat(text.getValue()).isEqualTo("Ravi pressed SOS\n\nlat: 17.44\nriderId: r-1");
    }

    @Test
    void opsAlertReportsAnEmailThatWasNotAccepted() throws Exception {
        when(email.configured()).thenReturn(true);
        when(email.sendPlainText(anyList(), anyString(), anyString())).thenReturn(Outcome.UNKNOWN);

        mvc(sender, "lead@craves.test").perform(authed("/internal/v1/ops-alerts", SOS))
            .andExpect(status().isBadGateway())
            .andExpect(jsonPath("$.code").value("OPS_ALERT_FAILED"));
    }

    @Test
    void opsAlertRejectsBadKindsAndBadConfiguration() throws Exception {
        mvc(sender, "lead@craves.test").perform(authed("/internal/v1/ops-alerts", SOS.replace("\"SOS\"", "\"sos\\nFAKE\"")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        verifyNoInteractions(email);

        assertThatThrownBy(() -> mvc(sender, "lead@craves.test,not-an-address"))
            .isInstanceOf(IllegalStateException.class);
    }

    private MockMvc mvc(RealtimePushSender pushSender, String opsAlertEmails) {
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        if (pushSender != null) {
            beans.addBean("realtimePushSender", pushSender);
        }
        return MockMvcBuilders.standaloneSetup(new InternalRealtimeController(
            beans.getBeanProvider(RealtimePushSender.class), email, opsAlertEmails, KEY
        )).build();
    }

    private static MockHttpServletRequestBuilder json(String path, String body) {
        return post(path).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static MockHttpServletRequestBuilder authed(String path, String body) {
        return json(path, body).header("X-Craves-Internal-Key", KEY);
    }
}
