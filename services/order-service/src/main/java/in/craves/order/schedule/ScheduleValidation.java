package in.craves.order.schedule;

import in.craves.order.exception.OrderApiException;
import in.craves.order.schedule.ScheduledOrderModels.ChefScheduleResponseRequest;
import in.craves.order.schedule.ScheduledOrderModels.CreateScheduleRequest;
import in.craves.order.schedule.ScheduledOrderModels.SchedulePolicyRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.UUID;

public final class ScheduleValidation {
    private static final int MAX_NOTE_LENGTH = 500;
    private static final int MAX_TIMEZONE_LENGTH = 64;
    private static final int MAX_POLICY_MINUTES = 525_600;

    private ScheduleValidation() {
    }

    public static ValidatedCreate validateCreate(
        UUID checkoutId,
        String idempotencyKey,
        CreateScheduleRequest request,
        Instant now
    ) {
        if (checkoutId == null) {
            throw OrderApiException.badRequest("CHECKOUT_ID_REQUIRED", "Checkout id is required");
        }
        String normalizedKey = trimToNull(idempotencyKey);
        if (normalizedKey == null || normalizedKey.length() < 8 || normalizedKey.length() > 128) {
            throw OrderApiException.badRequest(
                "SCHEDULE_IDEMPOTENCY_KEY_INVALID",
                "Idempotency-Key must be between 8 and 128 characters"
            );
        }
        if (request == null || request.requestedFulfilmentAt() == null) {
            throw OrderApiException.badRequest(
                "SCHEDULE_TIME_REQUIRED",
                "requestedFulfilmentAt is required"
            );
        }
        if (!request.requestedFulfilmentAt().isAfter(now)) {
            throw OrderApiException.badRequest(
                "SCHEDULE_TIME_NOT_FUTURE",
                "requestedFulfilmentAt must be in the future"
            );
        }
        String timezone = trimToNull(request.requestedTimezone());
        if (timezone == null || timezone.length() > MAX_TIMEZONE_LENGTH) {
            throw OrderApiException.badRequest(
                "SCHEDULE_TIMEZONE_INVALID",
                "requestedTimezone must be a valid IANA timezone up to 64 characters"
            );
        }
        try {
            timezone = ZoneId.of(timezone).getId();
        } catch (DateTimeException exception) {
            throw OrderApiException.badRequest(
                "SCHEDULE_TIMEZONE_INVALID",
                "requestedTimezone must be a valid IANA timezone"
            );
        }
        String fingerprint = sha256(
            checkoutId + "|" + request.requestedFulfilmentAt() + "|" + timezone
        );
        return new ValidatedCreate(
            checkoutId,
            normalizedKey,
            fingerprint,
            request.requestedFulfilmentAt(),
            timezone
        );
    }

    public static ValidatedPolicy validatePolicy(SchedulePolicyRequest request, boolean exists) {
        if (request == null) {
            throw OrderApiException.badRequest("SCHEDULE_POLICY_REQUIRED", "Schedule policy request is required");
        }
        if (request.active() == null
            || request.minLeadMinutes() == null
            || request.maxHorizonMinutes() == null
            || request.paymentGate() == null) {
            throw OrderApiException.badRequest(
                "SCHEDULE_POLICY_FIELDS_REQUIRED",
                "active, minLeadMinutes, maxHorizonMinutes and paymentGate are required"
            );
        }
        if (exists && (request.expectedVersion() == null || request.expectedVersion() < 1)) {
            throw OrderApiException.badRequest(
                "SCHEDULE_POLICY_VERSION_REQUIRED",
                "A positive expectedVersion is required when updating a schedule policy"
            );
        }
        if (!exists && request.expectedVersion() != null) {
            throw OrderApiException.badRequest(
                "SCHEDULE_POLICY_VERSION_NOT_ALLOWED",
                "expectedVersion is only allowed when updating an existing schedule policy"
            );
        }
        int minLead = request.minLeadMinutes();
        int maxHorizon = request.maxHorizonMinutes();
        if (minLead < 0 || minLead > MAX_POLICY_MINUTES) {
            throw OrderApiException.badRequest(
                "SCHEDULE_MIN_LEAD_INVALID",
                "minLeadMinutes must be between 0 and 525600"
            );
        }
        if (maxHorizon <= minLead || maxHorizon > MAX_POLICY_MINUTES) {
            throw OrderApiException.badRequest(
                "SCHEDULE_MAX_HORIZON_INVALID",
                "maxHorizonMinutes must be greater than minLeadMinutes and at most 525600"
            );
        }
        return new ValidatedPolicy(
            request.active(),
            minLead,
            maxHorizon,
            request.paymentGate(),
            request.expectedVersion()
        );
    }

    public static ValidatedChefResponse validateChefResponse(ChefScheduleResponseRequest request) {
        if (request == null || request.action() == null) {
            throw OrderApiException.badRequest(
                "SCHEDULE_CHEF_ACTION_REQUIRED",
                "Chef schedule response action is required"
            );
        }
        if (request.expectedVersion() == null || request.expectedVersion() < 1) {
            throw OrderApiException.badRequest(
                "SCHEDULE_RESPONSE_VERSION_REQUIRED",
                "A positive expectedVersion is required"
            );
        }
        String note = trimToNull(request.responseNote());
        if (note != null && note.length() > MAX_NOTE_LENGTH) {
            throw OrderApiException.badRequest(
                "SCHEDULE_RESPONSE_NOTE_TOO_LONG",
                "responseNote must be at most 500 characters"
            );
        }
        return new ValidatedChefResponse(request.action(), note, request.expectedVersion());
    }

    public static String validateAdminReason(String reason) {
        String normalized = trimToNull(reason);
        if (normalized == null || normalized.length() < 10 || normalized.length() > 500) {
            throw OrderApiException.badRequest(
                "ADMIN_REASON_INVALID",
                "X-Admin-Reason must be between 10 and 500 characters"
            );
        }
        return normalized;
    }

    public static int validateLimit(Integer requested, int defaultValue, int maximum) {
        int resolved = requested == null ? defaultValue : requested;
        if (resolved < 1 || resolved > maximum) {
            throw OrderApiException.badRequest(
                "SCHEDULE_LIMIT_INVALID",
                "Schedule limit must be between 1 and " + maximum
            );
        }
        return resolved;
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public record ValidatedCreate(
        UUID checkoutId,
        String idempotencyKey,
        String requestFingerprint,
        Instant requestedFulfilmentAt,
        String requestedTimezone
    ) {
    }

    public record ValidatedPolicy(
        boolean active,
        int minLeadMinutes,
        int maxHorizonMinutes,
        ScheduledOrderModels.PaymentGate paymentGate,
        Integer expectedVersion
    ) {
    }

    public record ValidatedChefResponse(
        ScheduledOrderModels.ChefResponseAction action,
        String responseNote,
        int expectedVersion
    ) {
    }
}
