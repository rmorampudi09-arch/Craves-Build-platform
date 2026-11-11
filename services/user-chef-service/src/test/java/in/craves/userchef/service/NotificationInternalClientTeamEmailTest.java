package in.craves.userchef.service;

import in.craves.userchef.config.AuthInternalClientProperties;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

class NotificationInternalClientTeamEmailTest {
    @Test
    void teamEmailIsAnEmailToTheTeamAddressTiedToTheApplicantAsChef() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        AuthInternalClientProperties properties = new AuthInternalClientProperties();
        properties.setNotificationServiceBaseUrl("http://notification.internal");
        properties.setNotificationServiceKey("unit-test-key");
        UUID applicant = UUID.randomUUID();
        // notification-service honours `address` only on TEAM_ALERT rows and only for its configured team list (never falling
        // back to the applicant's own email); the CHEF role lets a chef-scoped account erasure clear these rows too.
        server.expect(requestTo("http://notification.internal/internal/v1/notifications"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("X-Craves-Internal-Key", "unit-test-key"))
            .andExpect(jsonPath("$.requestKey").value("chef-signup-key"))
            .andExpect(jsonPath("$.eventType").value("CHEF_SIGNUP_ALERT"))
            .andExpect(jsonPath("$.channel").value("EMAIL"))
            .andExpect(jsonPath("$.address").value("Waitlist@craves.in"))
            .andExpect(jsonPath("$.userId").value(applicant.toString()))
            .andExpect(jsonPath("$.userRole").value("CHEF"))
            .andExpect(jsonPath("$.title").value("Chef sign-up · +91 98480 12345"))
            .andExpect(jsonPath("$.body").value("Body"))
            .andExpect(jsonPath("$.targetType").value("TEAM_ALERT"))
            .andExpect(jsonPath("$.targetId").value(applicant.toString()))
            .andRespond(withStatus(HttpStatus.ACCEPTED));

        boolean accepted = new NotificationInternalClient(properties, builder, mock(ReviewEventBuffer.class))
            .teamEmail(applicant, "chef-signup-key", "Waitlist@craves.in", "Chef sign-up · +91 98480 12345", "Body");

        assertTrue(accepted);
        server.verify();
    }
}
