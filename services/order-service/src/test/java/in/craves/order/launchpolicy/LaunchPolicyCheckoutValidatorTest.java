package in.craves.order.launchpolicy;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LaunchPolicyCheckoutValidatorTest {
    @Test
    void returnsZeroForSamePoint() {
        assertThat(LaunchPolicyCheckoutValidator.haversineMeters(17.3850, 78.4867, 17.3850, 78.4867))
            .isEqualTo(0.0d);
    }

    @Test
    void calculatesHyderabadDistanceInMeters() {
        double meters = LaunchPolicyCheckoutValidator.haversineMeters(17.3850, 78.4867, 17.4375, 78.4483);
        assertThat(meters).isBetween(6_000.0d, 9_000.0d);
    }
}
