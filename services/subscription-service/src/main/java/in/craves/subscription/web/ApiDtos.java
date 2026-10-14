package in.craves.subscription.web;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ApiDtos {
    private ApiDtos() {
    }

    public record CreatePlanRequest(
        @NotBlank @Size(max = 80) String planCode,
        UUID chefIdentityId,
        @NotBlank @Size(max = 160) String name,
        @Size(max = 2000) String description,
        @NotBlank String billingPeriod,
        @NotNull @DecimalMin("0.00") BigDecimal amount,
        @Size(min = 3, max = 3) String currency
    ) {
    }

    public record UpdatePlanStatusRequest(@NotBlank String status) {
    }

    public record PlanResponse(
        UUID id,
        String planCode,
        UUID chefIdentityId,
        String name,
        String description,
        String billingPeriod,
        BigDecimal amount,
        String currency,
        String status,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record PublicPlanResponse(
        UUID id,
        String planCode,
        String name,
        String description,
        String billingPeriod,
        BigDecimal amount,
        String currency,
        String imageUrl
    ) {
    }

    public record CreateSubscriptionRequest(
        @NotNull UUID planId,
        @NotNull LocalDate startDate,
        @NotNull UUID deliveryAddressId,
        @Size(max = 2000) String notes
    ) {
    }

    public record SubscriptionStateChangeRequest(@Size(max = 1000) String reason) {
    }

    public record SubscriptionResponse(
        UUID id,
        UUID customerIdentityId,
        UUID planId,
        UUID chefIdentityId,
        String status,
        LocalDate startDate,
        LocalDate endDate,
        LocalDate nextServiceDate,
        UUID deliveryAddressId,
        String notes,
        Instant createdAt,
        Instant updatedAt,
        String planName,
        String billingPeriod,
        BigDecimal amount,
        String currency,
        LocalDate nextBillingDate,
        String planImageUrl
    ) {
    }

    public record CustomerSubscriptionResponse(
        UUID id,
        UUID planId,
        String status,
        LocalDate startDate,
        LocalDate endDate,
        LocalDate nextServiceDate,
        UUID deliveryAddressId,
        String notes,
        Instant createdAt,
        Instant updatedAt,
        String planName,
        String billingPeriod,
        BigDecimal amount,
        String currency,
        LocalDate nextBillingDate,
        String planImageUrl,
        Integer pauseDaysPerBill,
        Integer pauseDaysLeft,
        LocalDate pauseAutoResumeDate,
        List<DayCreditResponse> dayCredits
    ) {
    }

    /** A declined day or paused days: the customer chooses a refund request or the days at the end before the deadline. */
    public record DayCreditResponse(
        UUID id,
        String kind,
        LocalDate firstDate,
        LocalDate lastDate,
        String mealSlotCode,
        Integer days,
        String status,
        BigDecimal refundAmount,
        String currency,
        Instant choiceDeadline,
        boolean extendAvailable
    ) {
    }

    public record DayCreditChoiceRequest(String choice) {
    }
}
