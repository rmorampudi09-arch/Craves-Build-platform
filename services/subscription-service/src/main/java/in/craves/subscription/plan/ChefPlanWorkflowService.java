package in.craves.subscription.plan;

import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.plan.ChefPlanModels.ChefPlanInput;
import in.craves.subscription.plan.ChefPlanModels.ChefPlanResponse;
import in.craves.subscription.plan.ChefPlanModels.ReviewChefPlanRequest;
import in.craves.subscription.policy.SubscriptionPolicyRepository;
import in.craves.subscription.repository.SubscriptionRepository;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.web.ApiDtos.PlanResponse;
import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ChefPlanWorkflowService {
    private static final Set<String> BILLING_PERIODS = Set.of("WEEKLY", "MONTHLY");
    private static final Set<String> REVIEW_DECISIONS = Set.of("APPROVE", "REJECT");

    private final ChefPlanRepository repository;
    private final ChefPlanScheduleService scheduleService;
    private final SubscriptionPolicyRepository policyRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final CapacityService capacityService;

    public ChefPlanWorkflowService(
        ChefPlanRepository repository,
        ChefPlanScheduleService scheduleService,
        SubscriptionPolicyRepository policyRepository,
        SubscriptionRepository subscriptionRepository,
        CapacityService capacityService
    ) {
        this.repository = repository;
        this.scheduleService = scheduleService;
        this.policyRepository = policyRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.capacityService = capacityService;
    }

    public ChefPlanResponse create(ChefPlanInput input, CurrentUser user) {
        requireChef(user);
        ChefPlanInput normalized = normalize(input);
        String planCode = "MEAL-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase(Locale.ROOT);
        return repository.create(user.identityId(), planCode, normalized);
    }

    public List<ChefPlanResponse> listMine(CurrentUser user) {
        requireChef(user);
        return repository.listOwned(user.identityId());
    }

    public ChefPlanResponse getMine(UUID planId, CurrentUser user) {
        requireChef(user);
        return repository.requireOwned(planId, user.identityId());
    }

    public ChefPlanResponse update(UUID planId, ChefPlanInput input, CurrentUser user) {
        requireChef(user);
        return repository.update(planId, user.identityId(), normalize(input));
    }

    @Transactional
    public ChefPlanResponse submit(UUID planId, String note, CurrentUser user) {
        requireChef(user);
        ChefPlanResponse plan = repository.requireOwned(planId, user.identityId());
        if (!Set.of("DRAFT", "REJECTED").contains(plan.status())) {
            throw ApiException.conflict("PLAN_NOT_SUBMITTABLE", "Only draft or rejected plans can be submitted for approval");
        }
        scheduleService.requireReadyForSubmission(planId, user);
        return repository.submit(planId, user.identityId(), note);
    }

    @Transactional
    public ChefPlanResponse review(UUID planId, ReviewChefPlanRequest request, CurrentUser admin) {
        requireAdmin(admin);
        String decision = normalizeText(request.decision(), "decision");
        if (!REVIEW_DECISIONS.contains(decision)) {
            throw ApiException.badRequest("INVALID_REVIEW_DECISION", "decision must be APPROVE or REJECT");
        }
        ChefPlanResponse plan = repository.find(planId)
            .orElseThrow(() -> ApiException.notFound("PLAN_NOT_FOUND", "Subscription meal plan was not found"));
        if (!"PENDING_APPROVAL".equals(plan.status())) {
            throw ApiException.conflict("PLAN_NOT_PENDING_APPROVAL", "Only submitted meal plans can be reviewed");
        }
        if ("REJECT".equals(decision)) {
            return repository.review(planId, admin.identityId(), false, request.reason());
        }

        if (policyRepository.findActive(planId).isEmpty()) {
            throw ApiException.conflict(
                "PLAN_POLICY_NOT_READY",
                "Administrator approval requires an active platform subscription policy for this plan"
            );
        }
        scheduleService.activateSubmittedDraft(planId, admin);
        ChefPlanResponse approved = repository.review(planId, admin.identityId(), true, request.reason());

        PlanResponse active = subscriptionRepository.findPlanById(planId)
            .orElseThrow(() -> ApiException.notFound("PLAN_NOT_FOUND", "Subscription meal plan was not found after approval"));
        if (!capacityService.isPlanBookable(active)) {
            throw ApiException.conflict(
                "PLAN_CAPACITY_NOT_READY",
                "Plan approval requires subscription capacity for every selected meal slot"
            );
        }
        return approved;
    }

    private static ChefPlanInput normalize(ChefPlanInput input) {
        if (input == null) {
            throw ApiException.badRequest("PLAN_INPUT_REQUIRED", "Meal plan details are required");
        }
        String billing = normalizeText(input.billingPeriod(), "billingPeriod");
        if (!BILLING_PERIODS.contains(billing)) {
            throw ApiException.badRequest("INVALID_BILLING_PERIOD", "billingPeriod must be WEEKLY or MONTHLY");
        }
        BigDecimal amount = input.amount();
        if (amount == null || amount.signum() < 0) {
            throw ApiException.badRequest("INVALID_AMOUNT", "amount must be zero or greater");
        }
        String currency = StringUtils.hasText(input.currency()) ? input.currency().trim().toUpperCase(Locale.ROOT) : "INR";
        if (currency.length() != 3) {
            throw ApiException.badRequest("INVALID_CURRENCY", "currency must use a 3-letter code");
        }
        if (!StringUtils.hasText(input.name())) {
            throw ApiException.badRequest("PLAN_NAME_REQUIRED", "name is required");
        }
        return new ChefPlanInput(input.name().trim(), trim(input.description()), billing, amount, currency);
    }

    private static String normalizeText(String value, String field) {
        if (!StringUtils.hasText(value)) {
            throw ApiException.badRequest("INVALID_" + field.toUpperCase(Locale.ROOT), field + " is required");
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private static String trim(String value) {
        if (value == null) return null;
        String result = value.trim();
        return result.isEmpty() ? null : result;
    }

    private static void requireChef(CurrentUser user) {
        if (user == null || !user.hasRole("CHEF")) {
            throw ApiException.forbidden("ROLE_NOT_ALLOWED", "CHEF role is required to manage meal plans");
        }
    }

    private static void requireAdmin(CurrentUser user) {
        if (user == null || !user.hasAnyRole("PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN")) {
            throw ApiException.forbidden("ROLE_NOT_ALLOWED", "Subscription administrator role is required to review meal plans");
        }
    }
}
