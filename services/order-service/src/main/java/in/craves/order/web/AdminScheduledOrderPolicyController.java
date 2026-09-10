package in.craves.order.web;

import in.craves.order.schedule.ScheduledOrderModels.SchedulePolicyRequest;
import in.craves.order.schedule.ScheduledOrderModels.SchedulePolicyView;
import in.craves.order.schedule.ScheduledOrderService;
import in.craves.order.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/scheduled-order-policies")
public class AdminScheduledOrderPolicyController {
    private final ScheduledOrderService schedules;

    public AdminScheduledOrderPolicyController(ScheduledOrderService schedules) {
        this.schedules = schedules;
    }

    @GetMapping("/{kitchenId}")
    public SchedulePolicyView get(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID kitchenId
    ) {
        return schedules.getPolicy(principal, kitchenId);
    }

    @PutMapping("/{kitchenId}")
    public SchedulePolicyView upsert(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID kitchenId,
        @RequestHeader("X-Admin-Reason") String reason,
        @RequestBody SchedulePolicyRequest request
    ) {
        return schedules.upsertPolicy(principal, kitchenId, request, reason);
    }
}
