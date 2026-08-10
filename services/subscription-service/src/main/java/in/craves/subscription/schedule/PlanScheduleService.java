package in.craves.subscription.schedule;

import in.craves.subscription.exception.ApiException;
import in.craves.subscription.schedule.PlanScheduleModels.ActivateScheduleRequest;
import in.craves.subscription.schedule.PlanScheduleModels.PlanScheduleResponse;
import in.craves.subscription.schedule.PlanScheduleModels.PublicPlanScheduleResponse;
import in.craves.subscription.schedule.PlanScheduleModels.PublicScheduleItemResponse;
import in.craves.subscription.schedule.PlanScheduleModels.PutScheduleRequest;
import in.craves.subscription.schedule.PlanScheduleModels.ScheduleItemRequest;
import in.craves.subscription.schedule.PlanScheduleRepository.PlanOwner;
import in.craves.subscription.security.CurrentUser;
import java.time.DateTimeException;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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

    public PublicPlanScheduleResponse getPublicActive(UUID planId) {
        PlanOwner plan = repository.findPlanOwner(planId)
            .orElseThrow(() -> ApiException.notFound("PLAN_NOT_FOUND", "Subscription plan was not found"));
        if (!"ACTIVE".equals(plan.status())) {
            throw ApiException.notFound("PLAN_NOT_FOUND", "Active subscription plan was not found");
        }
        PlanScheduleResponse schedule = repository.findActive(planId)
            .orElseThrow(() -> ApiException.notFound("PLAN_SCHEDULE_NOT_FOUND", "Active meal schedule was not found"));
        return new PublicPlanScheduleResponse(
            schedule.planId(),
            schedule.recurrenceType(),
            schedule.timezone(),
            schedule.items().stream().map(item -> new PublicScheduleItemResponse(
                item.menuItemId(),
                item.quantity(),
                item.isoDayOfWeek(),
                item.dayOfMonth(),
                item.mealSlotCode(),
                item.serviceTime(),
                item.sequenceNumber()
            )).toList()
        );
    }

    public PlanScheduleResponse get(UUID planId, CurrentUser user) {
        PlanOwner plan = requireAdminManagedPlan(planId, user);
        return repository.find(plan.planId())
            .orElseThrow(() -> ApiException.notFound("PLAN_SCHEDULE_NOT_FOUND", "Plan schedule was not found"));
    }

    public PlanScheduleResponse put(UUID planId, PutScheduleRequest request, CurrentUser user) {
        PlanOwner plan = requireAdminManagedPlan(planId, user);
        if (plan.chefIdentityId() == null) {
            throw ApiException.conflict("PLAN_CHEF_REQUIRED", "An approved chef must be assigned before a schedule can be defined");
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
                request.generationLeadHours(),
                List.copyOf(request.items()),
                user.identityId()
            );
        } catch (IllegalStateException exception) {
            throw ApiException.conflict("PLAN_SCHEDULE_CONFLICT", exception.getMessage());
        }
    }

    public PlanScheduleResponse activate(UUID planId, ActivateScheduleRequest request, CurrentUser user) {
        PlanOwner plan = requireAdminManagedPlan(planId, user);
        PlanScheduleResponse schedule = repository.find(plan.planId())
            .filter(value -> "DRAFT".equals(value.status()))
            .orElseThrow(() -> ApiException.conflict("PLAN_SCHEDULE_NOT_DRAFT", "Only a draft schedule can be activated"));
        if (schedule.items().isEmpty()) {
            throw ApiException.conflict("PLAN_SCHEDULE_EMPTY", "Plan schedule must contain at least one meal item");
        }
        validateItems(schedule.recurrenceType(), schedule.items().stream()
            .map(item -> new ScheduleItemRequest(
                item.menuItemId(),
                item.quantity(),
                item.isoDayOfWeek(),
                item.dayOfMonth(),
                item.mealSlotCode(),
                item.serviceTime(),
                item.sequenceNumber()
            )).toList(), plan.chefIdentityId());
        try {
            return repository.activate(planId, user.identityId(), request.reason().trim());
        } catch (IllegalStateException exception) {
            throw ApiException.conflict("PLAN_SCHEDULE_NOT_DRAFT", exception.getMessage());
        }
    }

    private PlanOwner requireAdminManagedPlan(UUID planId, CurrentUser user) {
        requireAdmin(user);
        return repository.findPlanOwner(planId)
            .orElseThrow(() -> ApiException.notFound("PLAN_NOT_FOUND", "Subscription plan was not found"));
    }

    private void validateItems(String recurrence, List<ScheduleItemRequest> items, UUID chefIdentityId) {
        if (chefIdentityId == null) {
            throw ApiException.conflict("PLAN_CHEF_REQUIRED", "An approved chef must be assigned before a schedule can be managed");
        }
        Set<String> uniqueness = new HashSet<>();
        Map<String, LocalTime> slotTimes = new HashMap<>();
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
            String slot = item.mealSlotCode().trim().toUpperCase(Locale.ROOT);
            String day = item.isoDayOfWeek() != null ? "W:" + item.isoDayOfWeek() : "M:" + item.dayOfMonth();
            String itemKey = day + ":" + slot + ":" + item.menuItemId();
            if (!uniqueness.add(itemKey)) {
                throw ApiException.badRequest("DUPLICATE_SCHEDULE_ITEM", "Duplicate menu item inside the same service day and meal slot");
            }
            String slotKey = day + ":" + slot;
            LocalTime priorTime = slotTimes.putIfAbsent(slotKey, item.serviceTime());
            if (priorTime != null && !priorTime.equals(item.serviceTime())) {
                throw ApiException.badRequest(
                    "INCONSISTENT_MEAL_SLOT_TIME",
                    "All items in the same service day and meal slot must use the same serviceTime"
                );
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

    private static void requireAdmin(CurrentUser user) {
        if (user == null || !user.hasAnyRole("PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN")) {
            throw ApiException.forbidden("ROLE_NOT_ALLOWED", "Subscription administration role is required");
        }
    }
}
