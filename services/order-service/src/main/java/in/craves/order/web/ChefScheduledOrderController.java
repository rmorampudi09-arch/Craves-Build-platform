package in.craves.order.web;

import in.craves.order.schedule.ScheduledOrderModels.ChefScheduleResponseRequest;
import in.craves.order.schedule.ScheduledOrderModels.ChefScheduledOrderView;
import in.craves.order.schedule.ScheduledOrderModels.KitchenResponseStatus;
import in.craves.order.schedule.ScheduledOrderModels.KitchenScheduleResponseView;
import in.craves.order.schedule.ScheduledOrderModels.Page;
import in.craves.order.schedule.ScheduledOrderModels.ScheduleStatus;
import in.craves.order.schedule.ScheduledOrderService;
import in.craves.order.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/chef/scheduled-orders")
public class ChefScheduledOrderController {
    private final ScheduledOrderService schedules;

    public ChefScheduledOrderController(ScheduledOrderService schedules) {
        this.schedules = schedules;
    }

    @GetMapping
    public Page<ChefScheduledOrderView> list(
        @AuthenticationPrincipal CravesPrincipal principal,
        @RequestParam(required = false) ScheduleStatus scheduleStatus,
        @RequestParam(required = false) KitchenResponseStatus responseStatus,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) String cursor
    ) {
        return schedules.listChefScheduleQueue(
            principal,
            scheduleStatus,
            responseStatus,
            limit,
            cursor
        );
    }

    @PutMapping("/{scheduleRequestId}/orders/{orderId}/response")
    public KitchenScheduleResponseView respond(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID scheduleRequestId,
        @PathVariable UUID orderId,
        @RequestBody ChefScheduleResponseRequest request
    ) {
        return schedules.respondAsChef(principal, scheduleRequestId, orderId, request);
    }
}
