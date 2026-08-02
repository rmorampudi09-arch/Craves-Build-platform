package in.craves.subscription.schedule;

import in.craves.subscription.exception.ApiException;
import in.craves.subscription.schedule.PlanScheduleModels.ActivateScheduleRequest;
import in.craves.subscription.schedule.PlanScheduleModels.PlanScheduleResponse;
import in.craves.subscription.schedule.PlanScheduleModels.PutScheduleRequest;
import in.craves.subscription.schedule.PlanScheduleModels.ScheduleItemRequest;
import in.craves.subscription.schedule.PlanScheduleRepository.PlanOwner;
import in.craves.subscription.security.CurrentUser;
import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class PlanScheduleService {
    private static final Set<String> RECURRENCES = Set.of("WEEKLY", "MONTHLY");

    private final PlanScheduleRepository repository;
    private final PlanCatalogClient catalogClient;

    public PlanScheduleService(PlanScheduleRepository repository, PlanCatalogClient catalogClient) {
        this.repository = repository;
        this.catalogClient = catalogClient;
    }

    public PlanScheduleResponse get(UUID planId, CurrentUser user) {
        PlanOwner plan = requireOwnedPlan(planId, user);
        return repository.find(plan.planId())
            .orElseThrow(() -> ApiException.notFound("PLAN_SCHEDULE_NOT_FOUND", "Plan schedule was not found"));
    }

    public PlanScheduleResponse put(UUID planId, PutScheduleRequest request, CurrentUser user) {
        PlanOwner plan = requireOwnedPlan(planId, user);
        if (plan.chefIdentityId() == null) {
            throw ApiException.conflict("PLAN_CHEF_REQUIRED", "A plan chef is required before a schedule can be defined");
        }
        String recurrence = request.recurrenceType().trim().toUpperCase(Locale.ROOT);
        if (!RECURRENCES.contains(recurrence)) {
            throw ApiException.badRequest("INVALID_RECURRENCE", "recurrenceType must be WEEKLY or MONTHLY");
        }
        if (!recurrence.equals(plan.billingPeriod())) {
            throw ApiException.conflict(
                "RECURRENCE_BILLING_PERIOD_MISMATCH",
                "Schedule recurrence must match the plan billing period"
            );
        }
        requireTimezone(request.timezone());
        validateItems(recurrence, request.items(), plan.chefIdentityId());
        try {
            return repository.replaceDraft(
                planId,
                recurrence,
                request.timezone().trim(),
                request.serviceTime(),
                request.generationLeadHours(),
                List.copyOf(request.items()),
                user.identityId()
            );
        } catch (IllegalStateException exception) {
            throw ApiException.conflict("PLAN_SCHEDULE_ACTIVE", exception.getMessage());
        }
    }

    public PlanScheduleResponse activate(
        UUID planId,
        ActivateScheduleRequest request,
        CurrentUser user
    ) {
        PlanOwner plan = requireOwnedPlan(planId, user);
        PlanScheduleResponse schedule = repository.find(plan.planId())
            .orElseThrow(() -> ApiException.notFound("PLAN_SCHEDULE_NOT_FOUND", "Plan schedule was not found"));
        if (schedule.items().isEmpty()) {
            throw ApiException.conflict("PLAN_SCHEDULE_EMPTY", "Plan schedule must contain at least one meal item");
        }
        validateItems(schedule.recurrenceType(), schedule.items().stream()
            .map(item -> new ScheduleItemRequest(
                item.menuItemId(), item.quantity(), item.isoDayOfWeek(), item.dayOfMonth(), item.sequenceNumber()
            )).toList(), plan.chefIdentityId());
        try {
            return repository.activate(planId, user.identityId(), request.reason().trim());
        } catch (IllegalStateException exception) {
            throw ApiException.conflict("PLAN_SCHEDULE_NOT_DRAFT", exception.getMessage());
        }
    }

    private PlanOwner requireOwnedPlan(UUID planId, CurrentUser user) {
        requireRole(user, "PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN", "CHEF");
        PlanOwner plan = repository.findPlanOwner(planId)
            .orElseThrow(() -> ApiException.notFound("PLAN_NOT_FOUND", "Subscription plan was not found"));
        if (!isSubscriptionAdmin(user) && !user.identityId().equals(plan.chefIdentityId())) {
            throw ApiException.forbidden("PLAN_ACCESS_DENIED", "Chef cannot manage another chef's plan schedule");
        }
        return plan;
    }

    private void validateItems(String recurrence, List<ScheduleItemRequest> items, UUID chefIdentityId) {
        Set<String> uniqueness = new HashSet<>();
        for (ScheduleItemRequest item : items) {
            if ("WEEKLY".equals(recurrence)) {
                if (item.isoDayOfWeek() == null || item.dayOfMonth() != null) {
                    throw ApiException.badRequest(
                        "INVALID_WEEKLY_SCHEDULE_ITEM",
                        "Weekly items require isoDayOfWeek and must not set dayOfMonth"
                    );
                }
            } else if (item.dayOfMonth() == null || item.isoDayOfWeek() != null) {
                throw ApiException.badRequest(
                    "INVALID_MONTHLY_SCHEDULE_ITEM",
                    "Monthly items require dayOfMonth and must not set isoDayOfWeek"
                );
            }
            String key = item.menuItemId() + ":" + item.isoDayOfWeek() + ":" + item.dayOfMonth();
            if (!uniqueness.add(key)) {
                throw ApiException.badRequest("DUPLICATE_SCHEDULE_ITEM", "Duplicate menu item and service day");
            }
            catalogClient.requireSellableOwnedItem(item.menuItemId(), chefIdentityId);
        }
    }

    private static void requireTimezone(String timezone) {
        try {
            ZoneId.of(timezone.trim());
        } catch (DateTimeException exception) {
            throw ApiException.badRequest("INVALID_TIMEZONE", "timezone must be a valid IANA timezone");
        }
    }

    private static boolean isSubscriptionAdmin(CurrentUser user) {
        return user != null && user.hasAnyRole("PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN");
    }

    private static void requireRole(CurrentUser user, String... roles) {
        if (user != null) {
            for (String role : roles) {
                if (user.hasRole(role)) {
                    return;
                }
            }
        }
        throw ApiException.forbidden("ROLE_NOT_ALLOWED", "User does not have the required role");
    }
}

