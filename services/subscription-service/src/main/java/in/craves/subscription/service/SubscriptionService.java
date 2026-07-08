package in.craves.subscription.service;

import in.craves.subscription.exception.ApiException;
import in.craves.subscription.repository.SubscriptionRepository;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.web.ApiDtos.CreatePlanRequest;
import in.craves.subscription.web.ApiDtos.CreateSubscriptionRequest;
import in.craves.subscription.web.ApiDtos.PlanResponse;
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
    private static final Set<String> ADMIN_STATUS_CHANGES = Set.of("PENDING_PAYMENT", "ACTIVE", "PAUSED", "PAYMENT_FAILED", "EXPIRED", "CANCELLED");

    private final SubscriptionRepository repository;

    public SubscriptionService(SubscriptionRepository repository) {
        this.repository = repository;
    }

    public PlanResponse createPlan(CreatePlanRequest request, CurrentUser user) {
        requireRole(user, "ADMIN", "CHEF");
        String billingPeriod = normalize(request.billingPeriod(), "billingPeriod");
        if (!BILLING_PERIODS.contains(billingPeriod)) {
            throw ApiException.badRequest("INVALID_BILLING_PERIOD", "billingPeriod must be WEEKLY or MONTHLY");
        }
        BigDecimal amount = request.amount();
        if (amount == null || amount.signum() < 0) {
            throw ApiException.badRequest("INVALID_AMOUNT", "amount must be zero or greater");
        }
        String currency = StringUtils.hasText(request.currency()) ? request.currency().toUpperCase(Locale.ROOT) : "INR";
        UUID chefIdentityId = request.chefIdentityId();
        if (user.hasRole("CHEF") && chefIdentityId == null) {
            chefIdentityId = user.identityId();
        }
        return repository.createPlan(
            request.planCode().trim(),
            chefIdentityId,
            request.name().trim(),
            request.description(),
            billingPeriod,
            amount,
            currency
        );
    }

    public List<PlanResponse> listActivePlans() {
        return repository.listPlans(true);
    }

    public List<PlanResponse> listAllPlans(CurrentUser user) {
        requireRole(user, "ADMIN", "CHEF");
        return repository.listPlans(false);
    }

    public PlanResponse getPlan(UUID planId) {
        return repository.findPlanById(planId)
            .orElseThrow(() -> ApiException.notFound("PLAN_NOT_FOUND", "Subscription plan was not found"));
    }

    public PlanResponse updatePlanStatus(UUID planId, String status, CurrentUser user) {
        requireRole(user, "ADMIN", "CHEF");
        String normalized = normalize(status, "status");
        if (!PLAN_STATUSES.contains(normalized)) {
            throw ApiException.badRequest("INVALID_PLAN_STATUS", "status must be DRAFT, ACTIVE, or INACTIVE");
        }
        return repository.updatePlanStatus(planId, normalized);
    }

    public SubscriptionResponse createSubscription(CreateSubscriptionRequest request, CurrentUser user) {
        requireRole(user, "CUSTOMER", "ADMIN");
        PlanResponse plan = getPlan(request.planId());
        if (!"ACTIVE".equals(plan.status())) {
            throw ApiException.conflict("PLAN_NOT_ACTIVE", "Subscription plan is not active");
        }
        if (request.startDate().isBefore(LocalDate.now())) {
            throw ApiException.badRequest("INVALID_START_DATE", "startDate cannot be in the past");
        }
        return repository.createSubscription(user.identityId(), plan, request.startDate(), request.deliveryAddressId(), request.notes());
    }

    public List<SubscriptionResponse> listMine(CurrentUser user) {
        requireRole(user, "CUSTOMER", "ADMIN");
        return repository.listCustomerSubscriptions(user.identityId());
    }

    public SubscriptionResponse getMine(UUID subscriptionId, CurrentUser user) {
        SubscriptionResponse subscription = repository.findSubscriptionById(subscriptionId)
            .orElseThrow(() -> ApiException.notFound("SUBSCRIPTION_NOT_FOUND", "Subscription was not found"));
        if (!user.hasRole("ADMIN") && !subscription.customerIdentityId().equals(user.identityId())) {
            throw ApiException.forbidden("SUBSCRIPTION_ACCESS_DENIED", "You cannot access this subscription");
        }
        return subscription;
    }

    public SubscriptionResponse changeStatus(UUID subscriptionId, String newStatus, String reason, CurrentUser user) {
        SubscriptionResponse subscription = getMine(subscriptionId, user);
        String normalized = normalize(newStatus, "status");
        if (user.hasRole("ADMIN")) {
            if (!ADMIN_STATUS_CHANGES.contains(normalized)) {
                throw ApiException.badRequest("INVALID_SUBSCRIPTION_STATUS", "Invalid subscription status");
            }
        } else {
            if (!subscription.customerIdentityId().equals(user.identityId())) {
                throw ApiException.forbidden("SUBSCRIPTION_ACCESS_DENIED", "You cannot change this subscription");
            }
            if (!CUSTOMER_STATUS_CHANGES.contains(normalized)) {
                throw ApiException.forbidden("SUBSCRIPTION_STATUS_CHANGE_DENIED", "Customer can only pause or cancel subscription in MVP foundation");
            }
        }
        return repository.updateSubscriptionStatus(subscription.id(), normalized, reason, user.identityId());
    }

    private static String normalize(String value, String fieldName) {
        if (!StringUtils.hasText(value)) {
            throw ApiException.badRequest("INVALID_" + fieldName.toUpperCase(Locale.ROOT), fieldName + " is required");
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private static void requireRole(CurrentUser user, String... allowedRoles) {
        for (String role : allowedRoles) {
            if (user.hasRole(role)) {
                return;
            }
        }
        throw ApiException.forbidden("ROLE_NOT_ALLOWED", "User does not have the required role");
    }
}
