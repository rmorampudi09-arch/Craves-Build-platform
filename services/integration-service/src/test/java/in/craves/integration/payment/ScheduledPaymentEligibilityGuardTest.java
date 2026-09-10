package in.craves.integration.payment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class ScheduledPaymentEligibilityGuardTest {
    private static final UUID CHECKOUT_ID = UUID.fromString("11111111-2222-3333-4444-555555555555");

    @Test
    void acceptsValidatedEligibleAsapAndScheduledResponses() {
        assertThatCode(() -> ScheduledPaymentEligibilityGuard.validateEligibility(
            CHECKOUT_ID,
            new ScheduledPaymentEligibilityGuard.PaymentEligibilityResponse(
                CHECKOUT_ID,
                "ASAP",
                true,
                "ASAP_CHECKOUT",
                null,
                null
            )
        )).doesNotThrowAnyException();

        assertThatCode(() -> ScheduledPaymentEligibilityGuard.validateEligibility(
            CHECKOUT_ID,
            new ScheduledPaymentEligibilityGuard.PaymentEligibilityResponse(
                CHECKOUT_ID,
                "SCHEDULED",
                true,
                "ALL_CHEFS_CONFIRMED",
                UUID.randomUUID(),
                "CONFIRMED"
            )
        )).doesNotThrowAnyException();
    }

    @Test
    void rejectsIneligibleCheckoutBeforeProviderMutation() {
        assertThatThrownBy(() -> ScheduledPaymentEligibilityGuard.validateEligibility(
            CHECKOUT_ID,
            new ScheduledPaymentEligibilityGuard.PaymentEligibilityResponse(
                CHECKOUT_ID,
                "SCHEDULED",
                false,
                "CHEF_CONFIRMATION_PENDING",
                UUID.randomUUID(),
                "PENDING_CHEF_CONFIRMATION"
            )
        ))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(error -> {
                ResponseStatusException response = (ResponseStatusException) error;
                org.assertj.core.api.Assertions.assertThat(response.getStatusCode().value()).isEqualTo(409);
                org.assertj.core.api.Assertions.assertThat(response.getReason()).contains("CHEF_CONFIRMATION_PENDING");
            });
    }

    @Test
    void rejectsMismatchedOrMalformedOrderResponse() {
        assertThatThrownBy(() -> ScheduledPaymentEligibilityGuard.validateEligibility(
            CHECKOUT_ID,
            new ScheduledPaymentEligibilityGuard.PaymentEligibilityResponse(
                UUID.randomUUID(),
                "SCHEDULED",
                true,
                "ALL_CHEFS_CONFIRMED",
                UUID.randomUUID(),
                "CONFIRMED"
            )
        )).isInstanceOf(ResponseStatusException.class);

        assertThatThrownBy(() -> ScheduledPaymentEligibilityGuard.validateEligibility(
            CHECKOUT_ID,
            new ScheduledPaymentEligibilityGuard.PaymentEligibilityResponse(
                CHECKOUT_ID,
                "UNKNOWN",
                true,
                "OK",
                null,
                null
            )
        )).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void unsafeReasonIsNotReflected() {
        assertThatThrownBy(() -> ScheduledPaymentEligibilityGuard.validateEligibility(
            CHECKOUT_ID,
            new ScheduledPaymentEligibilityGuard.PaymentEligibilityResponse(
                CHECKOUT_ID,
                "SCHEDULED",
                false,
                "<script>alert(1)</script>",
                UUID.randomUUID(),
                "REJECTED"
            )
        ))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(error -> org.assertj.core.api.Assertions.assertThat(
                ((ResponseStatusException) error).getReason()
            ).contains("SCHEDULE_NOT_ELIGIBLE").doesNotContain("script"));
    }
}
