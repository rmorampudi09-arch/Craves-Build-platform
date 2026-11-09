package in.craves.notification.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class NotificationDeliveryPropertiesTest {
    @Test
    void allExternalDeliveryIsDisabledByDefault() {
        NotificationDeliveryProperties properties = new NotificationDeliveryProperties();
        properties.validate();

        assertThat(properties.isWorkerEnabled()).isFalse();
        assertThat(properties.isPushEnabled()).isFalse();
        assertThat(properties.isEmailEnabled()).isFalse();
        assertThat(properties.isRealtimePushEnabled()).isFalse();
    }

    @Test
    void pushRequiresFirebaseCredentialSecret() {
        NotificationDeliveryProperties properties = new NotificationDeliveryProperties();
        properties.setPushEnabled(true);

        assertThatThrownBy(properties::validate)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("Firebase service account secret");

        NotificationDeliveryProperties realtime = new NotificationDeliveryProperties();
        realtime.setRealtimePushEnabled(true);
        assertThatThrownBy(realtime::validate).hasMessageContaining("Firebase service account secret");
    }

    @Test
    void workerRequiresAtLeastOneProvider() {
        NotificationDeliveryProperties properties = new NotificationDeliveryProperties();
        properties.setWorkerEnabled(true);

        assertThatThrownBy(properties::validate)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("At least one provider channel");
    }

    @Test
    void teamEmailAddressesMustBeEmailAddressesAndMatchWithoutCase() {
        NotificationDeliveryProperties properties = new NotificationDeliveryProperties();
        properties.setTeamEmailAddresses(" Waitlist@craves.in ,ops@craves.in");
        properties.validate();
        assertThat(properties.isTeamEmailAddress("waitlist@CRAVES.in ")).isTrue();
        assertThat(properties.isTeamEmailAddress("someone@craves.in")).isFalse();
        assertThat(properties.isTeamEmailAddress(null)).isFalse();
        assertThat(new NotificationDeliveryProperties().isTeamEmailAddress("waitlist@craves.in")).isFalse();

        properties.setTeamEmailAddresses("Waitlist@craves.in,waitlist");
        assertThatThrownBy(properties::validate)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("CRAVES_NOTIFICATION_TEAM_EMAIL_ADDRESSES");
    }
}
