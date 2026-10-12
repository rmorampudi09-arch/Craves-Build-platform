package in.craves.subscription.service;

import in.craves.subscription.billing.SubscriptionBillingProperties;
import in.craves.subscription.billing.SubscriptionBillingRepository;
import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository;
import in.craves.subscription.plan.PlanImageRepository;
import in.craves.subscription.plan.PlanImageRepository.PlanImage;
import in.craves.subscription.repository.SubscriptionRepository;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.web.ApiDtos.CreateSubscriptionRequest;
import in.craves.subscription.web.ApiDtos.CustomerSubscriptionResponse;
import in.craves.subscription.web.ApiDtos.PlanResponse;
import in.craves.subscription.web.ApiDtos.PublicPlanResponse;
import in.craves.subscription.web.ApiDtos.SubscriptionResponse;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class SubscriptionService {
    private static final Set<String> ADMIN_STATUS_CHANGES = Set.of(
        "PENDING_PAYMENT", "ACTIVE", "PAUSED", "PAYMENT_FAILED", "EXPIRED", "CANCELLED"
    );
    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9._:-]{8,128}$");
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Kolkata");
    /** Meal plans are offered within this distance of the chef's kitchen, the same radius the app uses for dishes. */
    static final int PLAN_RADIUS_METERS = 10_000;

    private final SubscriptionRepository repository;
    private final CapacityService capacityService;
    private final PlanImageRepository planImages;
    private final SubscriptionBillingProperties billing;
    private final SubscriptionBillingRepository billingRepository;
    private final SubscriptionLifecycleRepository lifecycleRepository;

    public SubscriptionService(
        SubscriptionRepository repository,
        CapacityService capacityService,
        PlanImageRepository planImages,
        SubscriptionBillingProperties billing,
        SubscriptionBillingRepository billingRepository,
        SubscriptionLifecycleRepository lifecycleRepository
    ) {
        this.repository = repository;
        this.capacityService = capacityService;
        this.planImages = planImages;
        this.billing = billing;
        this.billingRepository = billingRepository;
        this.lifecycleRepository = lifecycleRepository;
    }

    /** Without a location every plan is listed, as older app versions expect; with one, only plans within 10 km. */
    public List<PublicPlanResponse> listActivePlans(Double latitude, Double longitude) {
        if ((latitude == null) != (longitude == null)) {
            throw ApiException.badRequest("LOCATION_INCOMPLETE", "Send both latitude and longitude, or neither");
        }
        if (latitude == null) {
            return listActivePlans();
        }
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw ApiException.badRequest("LOCATION_INVALID", "latitude or longitude is out of range");
        }
        return repository.listActivePlansNear(latitude, longitude, PLAN_RADIUS_METERS).stream()
            .filter(capacityService::isPlanBookable)
            .map(this::toPublicPlan)
            .toList();
    }

    public List<PublicPlanResponse> listActivePlans() {
        return repository.listPlans(true).stream()
            .filter(capacityService::isPlanBookable)
            // shortcut: one image lookup per listed plan, batch it if the public catalogue grows past a few dozen plans
            .map(this::toPublicPlan)
            .toList();
    }

    public List<PlanResponse> listAllPlans(CurrentUser user) {
        requireSubscriptionAdmin(user);
        return repository.listPlans(false);
    }

    public PublicPlanResponse getPlan(UUID planId) {
        PlanResponse plan = repository.findActivePlanById(planId)
            .orElseThrow(() -> ApiException.notFound("PLAN_NOT_FOUND", "Active subscription plan was not found"));
        if (!capacityService.isPlanBookable(plan)) {
            throw ApiException.notFound("PLAN_NOT_BOOKABLE", "Subscription plan is not currently accepting new enrollments");
        }
        return toPublicPlan(plan);
    }

    public PlanImage getPlanImage(UUID planId) {
        return planImages.findImage(planId)
            .orElseThrow(() -> ApiException.notFound("PLAN_IMAGE_NOT_FOUND", "Subscription plan image was not found"));
    }

    public PlanResponse updatePlanStatus(UUID planId, String status, CurrentUser user) {
        requireSubscriptionAdmin(user);
        String normalized = normalize(status, "status");
        if (!"INACTIVE".equals(normalized)) {
            throw ApiException.badRequest(
                "PLAN_REVIEW_REQUIRED",
                "Administrators can only deactivate plans here; Chef submissions must be approved through the review workflow"
            );
        }
        repository.findPlanById(planId)
            .orElseThrow(() -> ApiException.notFound("PLAN_NOT_FOUND", "Subscription plan was not found"));
        return repository.updatePlanStatus(planId, normalized, user.identityId());
    }

    @Transactional
    public CustomerSubscriptionResponse createSubscription(
        CreateSubscriptionRequest request,
        String idempotencyKey,
        CurrentUser user
    ) {
        requireRole(user, "CUSTOMER");
        String normalizedKey = normalizeIdempotencyKey(idempotencyKey);

        SubscriptionResponse existing = repository.findSubscriptionByEnrollmentKey(user.identityId(), normalizedKey)
            .orElse(null);
        if (existing != null) {
            ensureSameEnrollment(existing, request);
            if ("PENDING_PAYMENT".equals(existing.status())) {
                capacityService.acquireEnrollmentHold(existing);
            }
            return toCustomerSubscription(existing);
        }

        PlanResponse plan = repository.findActivePlanById(request.planId())
            .orElseThrow(() -> ApiException.conflict("PLAN_NOT_ACTIVE", "Subscription plan is not active or not fully configured"));
        if (!repository.isPlanAcceptingSubscribers(plan.id())) {
            throw ApiException.conflict("PLAN_NOT_ACCEPTING_SUBSCRIBERS", "This meal plan is not accepting new subscribers");
        }
        if (!capacityService.isPlanBookable(plan)) {
            throw ApiException.conflict("SUBSCRIPTION_CAPACITY_UNAVAILABLE", "Subscription capacity is no longer available");
        }
        if (request.startDate().isBefore(LocalDate.now(BUSINESS_ZONE))) {
            throw ApiException.badRequest("INVALID_START_DATE", "startDate cannot be in the past");
        }
        if (request.deliveryAddressId() == null) {
            throw ApiException.badRequest("DELIVERY_ADDRESS_REQUIRED", "deliveryAddressId is required for meal subscriptions");
        }
        if (!repository.isAddressNearChef(user.identityId(), request.deliveryAddressId(), plan.chefIdentityId(), PLAN_RADIUS_METERS)) {
            throw ApiException.badRequest(
                "DELIVERY_ADDRESS_OUT_OF_RANGE",
                "This chef delivers meal plans within 10 km of their kitchen. Choose an address closer to the chef."
            );
        }
        SubscriptionResponse stored = repository.createSubscription(
            user.identityId(),
            plan,
            request.startDate(),
            request.deliveryAddressId(),
            request.notes(),
            normalizedKey
        );
        ensureSameEnrollment(stored, request);
        capacityService.acquireEnrollmentHold(stored);
        return toCustomerSubscription(stored);
    }

    public List<CustomerSubscriptionResponse> listMine(CurrentUser user) {
        requireRole(user, "CUSTOMER");
        return repository.listCustomerSubscriptions(user.identityId()).stream()
            .map(this::toCustomerSubscription)
            .toList();
    }

    public CustomerSubscriptionResponse getMine(UUID subscriptionId, CurrentUser user) {
        return toCustomerSubscription(getOwnedSubscription(subscriptionId, user));
    }

    @Transactional
    public SubscriptionResponse adminChangeStatus(
        UUID subscriptionId, String newStatus, String reason, CurrentUser user
    ) {
        requireSubscriptionAdmin(user);
        if (!StringUtils.hasText(reason)) {
            throw ApiException.badRequest("ADMIN_REASON_REQUIRED", "An operational reason is required for admin status changes");
        }
        SubscriptionResponse subscription = repository.findSubscriptionById(subscriptionId)
            .orElseThrow(() -> ApiException.notFound("SUBSCRIPTION_NOT_FOUND", "Subscription was not found"));
        String normalized = normalize(newStatus, "status");
        if (!ADMIN_STATUS_CHANGES.contains(normalized)) {
            throw ApiException.badRequest("INVALID_SUBSCRIPTION_STATUS", "Invalid subscription status");
        }
        if (subscription.status().equals(normalized)) {
            return subscription;
        }

        if ("ACTIVE".equals(normalized)) {
            if ("PAUSED".equals(subscription.status())) {
                LocalDate resumeDate = subscription.nextServiceDate() == null
                    ? LocalDate.now(BUSINESS_ZONE)
                    : subscription.nextServiceDate().isBefore(LocalDate.now(BUSINESS_ZONE)) ? LocalDate.now(BUSINESS_ZONE) : subscription.nextServiceDate();
                capacityService.reacquireForResume(subscription, resumeDate);
                // Before the status update so the returned subscription already shows the moved billing date.
                billingRepository.applyPauseCredit(subscription.id(), resumeDate);
            } else {
                capacityService.commitForActivation(subscription);
            }
        } else if ("PAUSED".equals(normalized)) {
            capacityService.releaseForPauseOrTerminal(subscription, LocalDate.now(BUSINESS_ZONE), "Administrator paused subscription: " + reason.trim());
        } else if (Set.of("PAYMENT_FAILED", "EXPIRED", "CANCELLED").contains(normalized)) {
            capacityService.releaseForPauseOrTerminal(subscription, LocalDate.now(BUSINESS_ZONE), "Administrator moved subscription to " + normalized + ": " + reason.trim());
        }
        SubscriptionResponse updated = repository.updateSubscriptionStatus(
            subscription.id(), subscription.status(), normalized, reason.trim(), user.identityId()
        );
        if (Set.of("PAUSED", "CANCELLED", "EXPIRED").contains(normalized)) {
            // The order worker sends every queued meal without checking the plan, so stop them here as the customer paths do.
            lifecycleRepository.cancelUndispatchedOccurrences(subscription.id(), user.identityId(), "ADMIN_STATUS_CHANGE");
        }
        return updated;
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

    private static void ensureSameEnrollment(SubscriptionResponse existing, CreateSubscriptionRequest request) {
        boolean same = existing.planId().equals(request.planId())
            && existing.startDate().equals(request.startDate())
            && java.util.Objects.equals(existing.deliveryAddressId(), request.deliveryAddressId());
        if (!same) {
            throw ApiException.conflict(
                "SUBSCRIPTION_IDEMPOTENCY_CONFLICT",
                "The idempotency key is already associated with a different enrollment request"
            );
        }
    }

    private static String normalizeIdempotencyKey(String value) {
        if (!StringUtils.hasText(value)) {
            throw ApiException.badRequest("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required");
        }
        String normalized = value.trim();
        if (!IDEMPOTENCY_KEY.matcher(normalized).matches()) {
            throw ApiException.badRequest(
                "INVALID_IDEMPOTENCY_KEY",
                "Idempotency-Key must be 8-128 URL-safe characters"
            );
        }
        return normalized;
    }

    private PublicPlanResponse toPublicPlan(PlanResponse plan) {
        return new PublicPlanResponse(
            plan.id(), plan.planCode(), plan.name(), plan.description(),
            plan.billingPeriod(), plan.amount(), plan.currency(), planImages.findImagePath(plan.id())
        );
    }

    private CustomerSubscriptionResponse toCustomerSubscription(SubscriptionResponse subscription) {
        return new CustomerSubscriptionResponse(
            subscription.id(), subscription.planId(), subscription.status(), subscription.startDate(),
            subscription.endDate(), subscription.nextServiceDate(), subscription.deliveryAddressId(),
            subscription.notes(), subscription.createdAt(), subscription.updatedAt(),
            subscription.planName(), subscription.billingPeriod(), subscription.amount(), subscription.currency(),
            nextChargeDate(subscription.nextBillingDate(), billing, LocalDate.now(BUSINESS_ZONE)),
            subscription.planImageUrl()
        );
    }

    /**
     * next_billing_date is the start of the next unbilled cycle, and the billing job charges it
     * horizonDays early, so that is when the customer is next charged (never in the past).
     * Null while automatic billing is off, because then nothing renews on its own.
     */
    public static LocalDate nextChargeDate(LocalDate nextBillingDate, SubscriptionBillingProperties billing, LocalDate today) {
        if (nextBillingDate == null || !billing.isGeneratorEnabled()) {
            return null;
        }
        LocalDate charge = nextBillingDate.minusDays(billing.getHorizonDays());
        return charge.isBefore(today) ? today : charge;
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

    private static void requireSubscriptionAdmin(CurrentUser user) {
        requireRole(user, "PLATFORM_ADMIN", "SUBSCRIPTION_ADMIN");
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
