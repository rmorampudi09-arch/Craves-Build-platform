package in.craves.order.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.order.exception.OrderApiException;
import in.craves.order.schedule.ScheduledOrderModels.ChefResponseAction;
import in.craves.order.schedule.ScheduledOrderModels.ChefScheduleResponseRequest;
import in.craves.order.schedule.ScheduledOrderModels.CreateScheduleRequest;
import in.craves.order.schedule.ScheduledOrderModels.PaymentGate;
import in.craves.order.schedule.ScheduledOrderModels.SchedulePolicyRequest;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ScheduleValidationTest {
    private static final Instant NOW = Instant.parse("2026-09-11T00:00:00Z");

    @Test
    void validatesAndCanonicalizesCreateRequest() {
        UUID checkoutId = UUID.fromString("11111111-2222-3333-4444-555555555555");
        var validated = ScheduleValidation.validateCreate(
            checkoutId,
            " schedule-key-001 ",
            new CreateScheduleRequest(NOW.plusSeconds(3600), "Asia/Kolkata"),
            NOW
        );

        assertThat(validated.checkoutId()).isEqualTo(checkoutId);
        assertThat(validated.idempotencyKey()).isEqualTo("schedule-key-001");
        assertThat(validated.requestedTimezone()).isEqualTo("Asia/Kolkata");
        assertThat(validated.requestFingerprint()).matches("[0-9a-f]{64}");
    }

    @Test
    void fingerprintIsDeterministicAndPayloadSensitive() {
        UUID checkoutId = UUID.randomUUID();
        var first = ScheduleValidation.validateCreate(
            checkoutId,
            "schedule-key-001",
            new CreateScheduleRequest(NOW.plusSeconds(3600), "Asia/Kolkata"),
            NOW
        );
        var retry = ScheduleValidation.validateCreate(
            checkoutId,
            "schedule-key-001",
            new CreateScheduleRequest(NOW.plusSeconds(3600), "Asia/Kolkata"),
            NOW
        );
        var changed = ScheduleValidation.validateCreate(
            checkoutId,
            "schedule-key-001",
            new CreateScheduleRequest(NOW.plusSeconds(7200), "Asia/Kolkata"),
            NOW
        );

        assertThat(retry.requestFingerprint()).isEqualTo(first.requestFingerprint());
        assertThat(changed.requestFingerprint()).isNotEqualTo(first.requestFingerprint());
    }

    @Test
    void rejectsPastTimeBadTimezoneAndWeakIdempotencyKey() {
        UUID checkoutId = UUID.randomUUID();
        assertThatThrownBy(() -> ScheduleValidation.validateCreate(
            checkoutId,
            "schedule-key-001",
            new CreateScheduleRequest(NOW, "Asia/Kolkata"),
            NOW
        )).isInstanceOf(OrderApiException.class);

        assertThatThrownBy(() -> ScheduleValidation.validateCreate(
            checkoutId,
            "schedule-key-001",
            new CreateScheduleRequest(NOW.plusSeconds(3600), "Not/AZone"),
            NOW
        )).isInstanceOf(OrderApiException.class);

        assertThatThrownBy(() -> ScheduleValidation.validateCreate(
            checkoutId,
            "short",
            new CreateScheduleRequest(NOW.plusSeconds(3600), "Asia/Kolkata"),
            NOW
        )).isInstanceOf(OrderApiException.class);
    }

    @Test
    void policyRequiresExplicitValuesAndOptimisticVersionForUpdates() {
        var created = ScheduleValidation.validatePolicy(new SchedulePolicyRequest(
            true,
            60,
            2880,
            PaymentGate.PAYMENT_AFTER_ALL_CHEFS_CONFIRM,
            null
        ), false);
        assertThat(created.minLeadMinutes()).isEqualTo(60);
        assertThat(created.maxHorizonMinutes()).isEqualTo(2880);

        assertThatThrownBy(() -> ScheduleValidation.validatePolicy(new SchedulePolicyRequest(
            true,
            60,
            60,
            PaymentGate.PAYMENT_AFTER_ALL_CHEFS_CONFIRM,
            null
        ), false)).isInstanceOf(OrderApiException.class);

        assertThatThrownBy(() -> ScheduleValidation.validatePolicy(new SchedulePolicyRequest(
            true,
            60,
            2880,
            PaymentGate.PAYMENT_BEFORE_CHEF_CONFIRMATION,
            null
        ), true)).isInstanceOf(OrderApiException.class);
    }

    @Test
    void chefResponseRequiresVersionAndBoundsNote() {
        var response = ScheduleValidation.validateChefResponse(new ChefScheduleResponseRequest(
            ChefResponseAction.ACCEPT,
            "  Available for this slot  ",
            1
        ));
        assertThat(response.responseNote()).isEqualTo("Available for this slot");

        assertThatThrownBy(() -> ScheduleValidation.validateChefResponse(new ChefScheduleResponseRequest(
            ChefResponseAction.REJECT,
            "x".repeat(501),
            1
        ))).isInstanceOf(OrderApiException.class);

        assertThatThrownBy(() -> ScheduleValidation.validateChefResponse(new ChefScheduleResponseRequest(
            ChefResponseAction.ACCEPT,
            null,
            null
        ))).isInstanceOf(OrderApiException.class);
    }

    @Test
    void adminReasonAndPageSizeAreBounded() {
        assertThatThrownBy(() -> ScheduleValidation.validateAdminReason("too short"))
            .isInstanceOf(OrderApiException.class);
        assertThat(ScheduleValidation.validateAdminReason("Enable after kitchen confirmation")).isNotBlank();
        assertThatThrownBy(() -> ScheduleValidation.validateLimit(101, 20, 100))
            .isInstanceOf(OrderApiException.class);
    }
}
