package in.craves.order.web;

import in.craves.order.schedule.ScheduledOrderModels.CreateScheduleRequest;
import in.craves.order.schedule.ScheduledOrderModels.ScheduleCapabilityResponse;
import in.craves.order.schedule.ScheduledOrderModels.ScheduleRequestView;
import in.craves.order.schedule.ScheduledOrderService;
import in.craves.order.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/checkouts/{checkoutId}/schedule")
public class ScheduledOrderController {
    private final ScheduledOrderService schedules;

    public ScheduledOrderController(ScheduledOrderService schedules) {
        this.schedules = schedules;
    }

    @GetMapping("/capability")
    public ScheduleCapabilityResponse capability(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID checkoutId
    ) {
        return schedules.capability(principal, checkoutId);
    }

    @PostMapping
    public ScheduleRequestView create(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID checkoutId,
        @RequestHeader("Idempotency-Key") String idempotencyKey,
        @RequestBody CreateScheduleRequest request
    ) {
        return schedules.createSchedule(principal, checkoutId, idempotencyKey, request);
    }

    @GetMapping
    public ScheduleRequestView get(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID checkoutId
    ) {
        return schedules.getSchedule(principal, checkoutId);
    }

    @DeleteMapping
    public ScheduleRequestView withdraw(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID checkoutId
    ) {
        return schedules.withdrawSchedule(principal, checkoutId);
    }
}
