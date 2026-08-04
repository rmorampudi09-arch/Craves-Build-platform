package in.craves.subscription.service;

import in.craves.subscription.exception.ApiException;
import in.craves.subscription.repository.SubscriptionRepository;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.web.ApiDtos.CreatePlanRequest;
import in.craves.subscription.web.ApiDtos.CreateSubscriptionRequest;
import in.craves.subscription.web.ApiDtos.CustomerSubscriptionResponse;
import in.craves.subscription.web.ApiDtos.PlanResponse;
import in.craves.subscription.web.ApiDtos.PublicPlanResponse;
import in.craves.subscription.web.ApiDtos.SubscriptionResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class SubscriptionService {
    private static final Set<String> BILLING_PERIODS = Set.of("WEEKLY", "MONTHLY");
    private static final Set<String> PLAN_STATUSES = Set.of("DRAFT", "ACTIVE", "INACTIVE");
    private static final Set<String> CUSTOMER_STATUS_CHANGES = Set.of("PAUSED", "CANCELLED");
    private static final Set<String> ADMIN_STATUS_CHANGES = Set.of(
        "PENDING_PAYMENT", "ACTIVE", "PAUSED", "PAYMENT_FAILED", "EXPIRED", "CANCELLED"
    );

    private final SubscriptionRepository repository;

    public SubscriptionService(SubscriptionRepository repository) {
        this.repository = repository;
    }

    public PlanResponse createPlan(CreatePlanRequest request, CurrentUser user) {
        requireRole(user, "PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN", "CHEF");
        String billingPeriod = normalize(request.billingPeriod(), "billingPeriod");
        if (!BILLING_PERIODS.contains(billingPeriod)) {
            throw ApiException.badRequest("INVALID_BILLING_PERIOD", "billingPeriod must be WEEKLY or MONTHLY");
        }
        BigDecimal amount = request.amount();
        if (amount == null || amount.signum() < 0) {
            throw ApiException.badRequest("INVALID_AMOUNT", "amount must be zero or greater");
        }
        String currency = StringUtils.hasText(request.currency())
            ? request.currency().toUpperCase(Locale.ROOT) : "INR";
        UUID chefIdentityId = isSubscriptionAdmin(user) ? request.chefIdentityId() : user.identityId();
        return repository.createPlan(
            request.planCode().trim(), chefIdentityId, request.name().trim(), request.description(),
            billingPeriod, amount, currency, user.identityId()
        );
    }

    public List<PublicPlanResponse> listActivePlans() {
        return repository.listPlans(true).stream().map(SubscriptionService::toPublicPlan).toList();
    }

    public List<PlanResponse> listAllPlans(CurrentUser user) {
        requireRole(user, "PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN", "CHEF");
        return isSubscriptionAdmin(user) ? repository.listPlans(false) : repository.listPlansForChef(user.identityId());
    }

    public PublicPlanResponse getPlan(UUID planId) {
        return repository.findActivePlanById(planId)
            .map(SubscriptionService::toPublicPlan)
            .orElseThrow(() -> ApiException.notFound("PLAN_NOT_FOUND", "Active subscription plan was not found"));
    }

    public PlanResponse updatePlanStatus(UUID planId, String status, CurrentUser user) {
        requireRole(user, "PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN", "CHEF");
        String normalized = normalize(status, "status");
        if (!PLAN_STATUSES.contains(normalized)) {
            throw ApiException.badRequest("INVALID_PLAN_STATUS", "status must be DRAFT, ACTIVE, or INACTIVE");
        }
        if (isSubscriptionAdmin(user)) {
            return repository.updatePlanStatus(planId, normalized, user.identityId());
        }
        return repository.updatePlanStatusForChef(planId, user.identityId(), normalized, user.identityId());
    }

    public CustomerSubscriptionResponse createSubscription(CreateSubscriptionRequest request, CurrentUser user) {
        requireRole(user, "CUSTOMER");
        PlanResponse plan = repository.findActivePlanById(request.planId())
            .orElseThrow(() -> ApiException.conflict("PLAN_NOT_ACTIVE", "Subscription plan is not active"));
        if (request.startDate().isBefore(LocalDate.now())) {
            throw ApiException.badRequest("INVALID_START_DATE", "startDate cannot be in the past");
        }
        return toCustomerSubscription(
            repository.createSubscription(
                user.identityId(), plan, request.startDate(), request.deliveryAddressId(), request.notes()
            )
        );
    }

    public List<CustomerSubscriptionResponse> listMine(CurrentUser user) {
        requireRole(user, "CUSTOMER");
        return repository.listCustomerSubscriptions(user.identityId()).stream()
            .map(SubscriptionService::toCustomerSubscription)
            .toList();
    }

    public CustomerSubscriptionResponse getMine(UUID subscriptionId, CurrentUser user) {
        return toCustomerSubscription(getOwnedSubscription(subscriptionId, user));
    }

    public CustomerSubscriptionResponse changeCustomerStatus(
        UUID subscriptionId, String newStatus, String reason, CurrentUser user
    ) {
        requireRole(user, "CUSTOMER");
        SubscriptionResponse subscription = getOwnedSubscription(subscriptionId, user);
        String normalized = normalize(newStatus, "status");
        if (!CUSTOMER_STATUS_CHANGES.contains(normalized)) {
            throw ApiException.forbidden(
                "SUBSCRIPTION_STATUS_CHANGE_DENIED",
                "Customer can only pause or cancel subscription in MVP foundation"
            );
        }
        return toCustomerSubscription(
            repository.updateSubscriptionStatus(subscription.id(), normalized, reason, user.identityId())
        );
    }

    public SubscriptionResponse adminChangeStatus(
        UUID subscriptionId, String newStatus, String reason, CurrentUser user
    ) {
        requireRole(user, "PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN");
        SubscriptionResponse subscription = repository.findSubscriptionById(subscriptionId)
            .orElseThrow(() -> ApiException.notFound("SUBSCRIPTION_NOT_FOUND", "Subscription was not found"));
        String normalized = normalize(newStatus, "status");
        if (!ADMIN_STATUS_CHANGES.contains(normalized)) {
            throw ApiException.badRequest("INVALID_SUBSCRIPTION_STATUS", "Invalid subscription status");
        }
        return repository.updateSubscriptionStatus(subscription.id(), normalized, reason, user.identityId());
    }

    private SubscriptionResponse getOwnedSubscription(UUID subscriptionId, CurrentUser user) {
        requireRole(user, "CUSTOMER", "PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN");
        SubscriptionResponse subscription = repository.findSubscriptionById(subscriptionId)
            .orElseThrow(() -> ApiException.notFound("SUBSCRIPTION_NOT_FOUND", "Subscription was not found"));
        if (!isSubscriptionAdmin(user) && !subscription.customerIdentityId().equals(user.identityId())) {
            throw ApiException.forbidden("SUBSCRIPTION_ACCESS_DENIED", "You cannot access this subscription");
        }
        return subscription;
    }

    private static PublicPlanResponse toPublicPlan(PlanResponse plan) {
        return new PublicPlanResponse(
            plan.id(), plan.planCode(), plan.name(), plan.description(),
            plan.billingPeriod(), plan.amount(), plan.currency()
        );
    }

    private static CustomerSubscriptionResponse toCustomerSubscription(SubscriptionResponse subscription) {
        return new CustomerSubscriptionResponse(
            subscription.id(), subscription.planId(), subscription.status(), subscription.startDate(),
            subscription.endDate(), subscription.nextServiceDate(), subscription.deliveryAddressId(),
            subscription.notes(), subscription.createdAt(), subscription.updatedAt()
        );
    }

    private static String normalize(String value, String fieldName) {
        if (!StringUtils.hasText(value)) {
            throw ApiException.badRequest(
                "INVALID_" + fieldName.toUpperCase(Locale.ROOT), fieldName + " is required"
            );
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private static boolean isSubscriptionAdmin(CurrentUser user) {
        return user != null && user.hasAnyRole("PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN");
    }

    private static void requireRole(CurrentUser user, String... allowedRoles) {
        if (user != null) {
            for (String role : allowedRoles) {
                if (user.hasRole(role)) {
                    return;
                }
            }
        }
        throw ApiException.forbidden("ROLE_NOT_ALLOWED", "User does not have the required role");
    }
}
