package in.craves.subscription.web;

import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.service.SubscriptionService;
import in.craves.subscription.web.ApiDtos.CreatePlanRequest;
import in.craves.subscription.web.ApiDtos.CreateSubscriptionRequest;
import in.craves.subscription.web.ApiDtos.CustomerSubscriptionResponse;
import in.craves.subscription.web.ApiDtos.PlanResponse;
import in.craves.subscription.web.ApiDtos.PublicPlanResponse;
import in.craves.subscription.web.ApiDtos.SubscriptionResponse;
import in.craves.subscription.web.ApiDtos.SubscriptionStateChangeRequest;
import in.craves.subscription.web.ApiDtos.UpdatePlanStatusRequest;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class SubscriptionController {
    private final SubscriptionService service;

    public SubscriptionController(SubscriptionService service) {
        this.service = service;
    }

    @GetMapping("/subscriptions/plans")
    public List<PublicPlanResponse> listActivePlans() {
        return service.listActivePlans();
    }

    @GetMapping("/subscriptions/plans/{planId}")
    public PublicPlanResponse getPlan(@PathVariable UUID planId) {
        return service.getPlan(planId);
    }

    @PostMapping("/admin/subscription-plans")
    public ResponseEntity<PlanResponse> createPlan(
        @Valid @RequestBody CreatePlanRequest request,
        @AuthenticationPrincipal CurrentUser user
    ) {
        PlanResponse response = service.createPlan(request, user);
        return ResponseEntity.created(URI.create("/api/v1/subscriptions/plans/" + response.id())).body(response);
    }

    @GetMapping("/admin/subscription-plans")
    public List<PlanResponse> listAllPlans(@AuthenticationPrincipal CurrentUser user) {
        return service.listAllPlans(user);
    }

    @PatchMapping("/admin/subscription-plans/{planId}/status")
    public PlanResponse updatePlanStatus(
        @PathVariable UUID planId,
        @Valid @RequestBody UpdatePlanStatusRequest request,
        @AuthenticationPrincipal CurrentUser user
    ) {
        return service.updatePlanStatus(planId, request.status(), user);
    }

    @PostMapping("/subscriptions")
    public ResponseEntity<CustomerSubscriptionResponse> createSubscription(
        @Valid @RequestBody CreateSubscriptionRequest request,
        @AuthenticationPrincipal CurrentUser user
    ) {
        CustomerSubscriptionResponse response = service.createSubscription(request, user);
        return ResponseEntity.created(URI.create("/api/v1/subscriptions/" + response.id())).body(response);
    }

    @GetMapping("/subscriptions")
    public List<CustomerSubscriptionResponse> listMySubscriptions(@AuthenticationPrincipal CurrentUser user) {
        return service.listMine(user);
    }

    @GetMapping("/subscriptions/{subscriptionId}")
    public CustomerSubscriptionResponse getSubscription(
        @PathVariable UUID subscriptionId,
        @AuthenticationPrincipal CurrentUser user
    ) {
        return service.getMine(subscriptionId, user);
    }

    @PatchMapping("/subscriptions/{subscriptionId}/pause")
    public CustomerSubscriptionResponse pauseSubscription(
        @PathVariable UUID subscriptionId,
        @RequestBody(required = false) SubscriptionStateChangeRequest request,
        @AuthenticationPrincipal CurrentUser user
    ) {
        return service.changeCustomerStatus(subscriptionId, "PAUSED", reason(request), user);
    }

    @PatchMapping("/subscriptions/{subscriptionId}/cancel")
    public CustomerSubscriptionResponse cancelSubscription(
        @PathVariable UUID subscriptionId,
        @RequestBody(required = false) SubscriptionStateChangeRequest request,
        @AuthenticationPrincipal CurrentUser user
    ) {
        return service.changeCustomerStatus(subscriptionId, "CANCELLED", reason(request), user);
    }

    @PatchMapping("/admin/subscriptions/{subscriptionId}/status/{status}")
    public SubscriptionResponse adminChangeStatus(
        @PathVariable UUID subscriptionId,
        @PathVariable String status,
        @RequestBody(required = false) SubscriptionStateChangeRequest request,
        @AuthenticationPrincipal CurrentUser user
    ) {
        return service.adminChangeStatus(subscriptionId, status, reason(request), user);
    }

    private static String reason(SubscriptionStateChangeRequest request) {
        return request == null ? null : request.reason();
    }
}
