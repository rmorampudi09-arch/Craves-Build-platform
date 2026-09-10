package in.craves.order.schedule;

import static in.craves.order.schedule.ScheduledOrderModels.*;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.exception.OrderApiException;
import in.craves.order.schedule.ScheduleValidation.ValidatedChefResponse;
import in.craves.order.schedule.ScheduleValidation.ValidatedCreate;
import in.craves.order.schedule.ScheduleValidation.ValidatedPolicy;
import in.craves.order.security.CravesPrincipal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ScheduledOrderService {
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public ScheduledOrderService(
        NamedParameterJdbcTemplate jdbc,
        ObjectMapper objectMapper,
        Clock clock
    ) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ScheduleCapabilityResponse capability(CravesPrincipal principal, UUID checkoutId) {
        requireRole(principal, "CUSTOMER");
        CheckoutRow checkout = requireCheckout(checkoutId, principal.identityId(), false);
        List<OrderRow> orders = loadOrders(checkoutId, false);
        return calculateCapability(checkout, orders, loadPolicies(kitchenIds(orders), false));
    }

    @Transactional
    public ScheduleRequestView createSchedule(
        CravesPrincipal principal,
        UUID checkoutId,
        String idempotencyKey,
        CreateScheduleRequest request
    ) {
        requireRole(principal, "CUSTOMER");
        Instant now = clock.instant();
        ValidatedCreate validated = ScheduleValidation.validateCreate(
            checkoutId,
            idempotencyKey,
            request,
            now
        );
        CheckoutRow checkout = requireCheckout(checkoutId, principal.identityId(), true);

        ScheduleRow previousByKey = findByIdempotency(
            principal.identityId(),
            validated.idempotencyKey(),
            true
        );
        if (previousByKey != null) {
            if (!previousByKey.checkoutId().equals(checkoutId)
                || !previousByKey.requestFingerprint().equals(validated.requestFingerprint())) {
                throw OrderApiException.conflict(
                    "SCHEDULE_IDEMPOTENCY_CONFLICT",
                    "Idempotency-Key has already been used for a different schedule request"
                );
            }
            return loadSchedule(previousByKey.id(), principal.identityId());
        }

        if (!"PAYMENT_PENDING".equals(checkout.status())) {
            throw OrderApiException.conflict(
                "CHECKOUT_NOT_SCHEDULABLE",
                "Only an owned PAYMENT_PENDING checkout can be scheduled"
            );
        }

        if (checkout.scheduleRequestId() != null) {
            ScheduleRow attached = requireSchedule(checkout.scheduleRequestId(), true);
            if (EnumSet.of(
                ScheduleStatus.PENDING_CHEF_CONFIRMATION,
                ScheduleStatus.CONFIRMED
            ).contains(attached.status())) {
                throw OrderApiException.conflict(
                    "ACTIVE_SCHEDULE_ALREADY_EXISTS",
                    "The checkout already has an active schedule request"
                );
            }
        }

        List<OrderRow> orders = loadOrders(checkoutId, true);
        if (orders.isEmpty()) {
            throw OrderApiException.conflict(
                "CHECKOUT_HAS_NO_ORDERS",
                "The checkout has no orders to schedule"
            );
        }
        if (orders.stream().anyMatch(order -> !"PAYMENT_PENDING".equals(order.status()))) {
            throw OrderApiException.conflict(
                "ORDER_NOT_SCHEDULABLE",
                "Every sub-order must remain PAYMENT_PENDING before scheduling"
            );
        }

        Map<UUID, PolicyRow> policies = loadPolicies(kitchenIds(orders), true);
        ScheduleCapabilityResponse capability = calculateCapability(checkout, orders, policies);
        if (!capability.supported()) {
            throw OrderApiException.conflict(
                capability.blockers().getFirst(),
                "Scheduled fulfilment is not configured consistently for every kitchen in this checkout"
            );
        }
        validateRequestedTime(validated.requestedFulfilmentAt(), now, orders, policies);

        UUID requestId = UUID.randomUUID();
        try {
            jdbc.update("""
                INSERT INTO order_schema.scheduled_order_request (
                    id, checkout_id, customer_identity_id,
                    requested_fulfilment_at, requested_timezone,
                    status, idempotency_key, request_fingerprint, version
                ) VALUES (
                    :id, :checkoutId, :customerId,
                    :requestedAt, :timezone,
                    'PENDING_CHEF_CONFIRMATION', :idempotencyKey, :fingerprint, 1
                )
                """, new MapSqlParameterSource()
                .addValue("id", requestId)
                .addValue("checkoutId", checkoutId)
                .addValue("customerId", principal.identityId())
                .addValue("requestedAt", Timestamp.from(validated.requestedFulfilmentAt()))
                .addValue("timezone", validated.requestedTimezone())
                .addValue("idempotencyKey", validated.idempotencyKey())
                .addValue("fingerprint", validated.requestFingerprint()));
        } catch (DuplicateKeyException exception) {
            ScheduleRow concurrent = findByIdempotency(
                principal.identityId(),
                validated.idempotencyKey(),
                true
            );
            if (concurrent != null
                && concurrent.checkoutId().equals(checkoutId)
                && concurrent.requestFingerprint().equals(validated.requestFingerprint())) {
                return loadSchedule(concurrent.id(), principal.identityId());
            }
            throw OrderApiException.conflict(
                "SCHEDULE_CREATE_CONFLICT",
                "A conflicting active schedule request already exists"
            );
        }

        for (OrderRow order : orders) {
            PolicyRow policy = policies.get(order.kitchenId());
            jdbc.update("""
                INSERT INTO order_schema.scheduled_order_kitchen_response (
                    schedule_request_id, order_id, kitchen_id,
                    chef_identity_id, payment_gate, status, version
                ) VALUES (
                    :scheduleId, :orderId, :kitchenId,
                    :chefId, :paymentGate, 'PENDING', 1
                )
                """, new MapSqlParameterSource()
                .addValue("scheduleId", requestId)
                .addValue("orderId", order.id())
                .addValue("kitchenId", order.kitchenId())
                .addValue("chefId", order.chefIdentityId())
                .addValue("paymentGate", policy.paymentGate().name()));
        }

        MapSqlParameterSource scheduleParameters = new MapSqlParameterSource()
            .addValue("scheduleId", requestId)
            .addValue("requestedAt", Timestamp.from(validated.requestedFulfilmentAt()))
            .addValue("timezone", validated.requestedTimezone())
            .addValue("checkoutId", checkoutId);
        jdbc.update("""
            UPDATE order_schema.checkout
               SET fulfilment_mode = 'SCHEDULED',
                   requested_fulfilment_at = :requestedAt,
                   requested_timezone = :timezone,
                   schedule_request_id = :scheduleId,
                   updated_at = now()
             WHERE id = :checkoutId
            """, scheduleParameters);
        jdbc.update("""
            UPDATE order_schema.customer_order
               SET fulfilment_mode = 'SCHEDULED',
                   requested_fulfilment_at = :requestedAt,
                   requested_timezone = :timezone,
                   schedule_request_id = :scheduleId,
                   updated_at = now()
             WHERE checkout_id = :checkoutId
            """, scheduleParameters);

        return loadSchedule(requestId, principal.identityId());
    }

    @Transactional(readOnly = true)
    public ScheduleRequestView getSchedule(CravesPrincipal principal, UUID checkoutId) {
        requireRole(principal, "CUSTOMER");
        requireCheckout(checkoutId, principal.identityId(), false);
        List<UUID> requestIds = jdbc.queryForList("""
            SELECT id
              FROM order_schema.scheduled_order_request
             WHERE checkout_id = :checkoutId
               AND customer_identity_id = :customerId
             ORDER BY created_at DESC, id DESC
             LIMIT 1
            """, new MapSqlParameterSource()
            .addValue("checkoutId", checkoutId)
            .addValue("customerId", principal.identityId()), UUID.class);
        if (requestIds.isEmpty()) {
            throw OrderApiException.notFound("SCHEDULE_REQUEST_NOT_FOUND", "Schedule request was not found");
        }
        return loadSchedule(requestIds.getFirst(), principal.identityId());
    }

    @Transactional
    public ScheduleRequestView withdrawSchedule(CravesPrincipal principal, UUID checkoutId) {
        requireRole(principal, "CUSTOMER");
        CheckoutRow checkout = requireCheckout(checkoutId, principal.identityId(), true);
        if (!"PAYMENT_PENDING".equals(checkout.status())) {
            throw OrderApiException.conflict(
                "SCHEDULE_WITHDRAWAL_NOT_ALLOWED",
                "Schedule selection can be withdrawn only before payment"
            );
        }
        if (checkout.scheduleRequestId() == null) {
            return getSchedule(principal, checkoutId);
        }
        ScheduleRow schedule = requireSchedule(checkout.scheduleRequestId(), true);
        if (schedule.status() == ScheduleStatus.CANCELLED) {
            return loadSchedule(schedule.id(), principal.identityId());
        }
        if (schedule.status() != ScheduleStatus.PENDING_CHEF_CONFIRMATION) {
            throw OrderApiException.conflict(
                "SCHEDULE_WITHDRAWAL_REQUIRES_POLICY",
                "A confirmed or rejected schedule cannot be changed without an approved cancellation policy"
            );
        }
        Integer nonPendingResponses = jdbc.queryForObject("""
            SELECT COUNT(*)
              FROM order_schema.scheduled_order_kitchen_response
             WHERE schedule_request_id = :scheduleId
               AND status <> 'PENDING'
            """, new MapSqlParameterSource("scheduleId", schedule.id()), Integer.class);
        if (nonPendingResponses != null && nonPendingResponses > 0) {
            throw OrderApiException.conflict(
                "SCHEDULE_WITHDRAWAL_REQUIRES_POLICY",
                "A chef has already responded; withdrawal requires an approved cancellation policy"
            );
        }

        jdbc.update("""
            UPDATE order_schema.scheduled_order_request
               SET status = 'CANCELLED',
                   version = version + 1,
                   cancelled_at = now(),
                   updated_at = now()
             WHERE id = :scheduleId
               AND status = 'PENDING_CHEF_CONFIRMATION'
            """, new MapSqlParameterSource("scheduleId", schedule.id()));
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("checkoutId", checkoutId)
            .addValue("scheduleId", schedule.id());
        jdbc.update("""
            UPDATE order_schema.checkout
               SET fulfilment_mode = 'ASAP',
                   requested_fulfilment_at = NULL,
                   requested_timezone = NULL,
                   schedule_request_id = NULL,
                   updated_at = now()
             WHERE id = :checkoutId
               AND schedule_request_id = :scheduleId
            """, parameters);
        jdbc.update("""
            UPDATE order_schema.customer_order
               SET fulfilment_mode = 'ASAP',
                   requested_fulfilment_at = NULL,
                   requested_timezone = NULL,
                   schedule_request_id = NULL,
                   updated_at = now()
             WHERE checkout_id = :checkoutId
               AND schedule_request_id = :scheduleId
            """, parameters);
        return loadSchedule(schedule.id(), principal.identityId());
    }

    @Transactional(readOnly = true)
    public Page<ChefScheduledOrderView> listChefScheduleQueue(
        CravesPrincipal principal,
        ScheduleStatus scheduleStatus,
        KitchenResponseStatus responseStatus,
        Integer requestedLimit,
        String cursorValue
    ) {
        requireRole(principal, "CHEF");
        int limit = ScheduleValidation.validateLimit(requestedLimit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        ScheduledOrderCursor cursor = ScheduledOrderCursorCodec.decode(cursorValue);
        StringBuilder sql = new StringBuilder("""
            SELECT sr.id AS schedule_request_id,
                   sr.checkout_id,
                   resp.order_id,
                   resp.kitchen_id,
                   sr.requested_fulfilment_at,
                   sr.requested_timezone,
                   sr.status AS schedule_status,
                   resp.status AS response_status,
                   resp.payment_gate,
                   resp.response_note,
                   resp.version AS response_version,
                   resp.responded_at,
                   sr.created_at
              FROM order_schema.scheduled_order_request sr
              JOIN order_schema.scheduled_order_kitchen_response resp
                ON resp.schedule_request_id = sr.id
             WHERE resp.chef_identity_id = :chefId
            """);
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("chefId", principal.identityId())
            .addValue("fetchLimit", limit + 1);
        if (scheduleStatus != null) {
            sql.append(" AND sr.status = :scheduleStatus");
            parameters.addValue("scheduleStatus", scheduleStatus.name());
        }
        if (responseStatus != null) {
            sql.append(" AND resp.status = :responseStatus");
            parameters.addValue("responseStatus", responseStatus.name());
        }
        if (cursor != null) {
            sql.append(" AND (sr.requested_fulfilment_at, sr.id, resp.order_id) > (:cursorTime, :cursorScheduleId, :cursorOrderId)");
            parameters
                .addValue("cursorTime", Timestamp.from(cursor.requestedAt()))
                .addValue("cursorScheduleId", cursor.scheduleRequestId())
                .addValue("cursorOrderId", cursor.orderId());
        }
        sql.append(" ORDER BY sr.requested_fulfilment_at ASC, sr.id ASC, resp.order_id ASC LIMIT :fetchLimit");
        List<ChefScheduledOrderView> fetched = jdbc.query(sql.toString(), parameters, this::mapChefQueue);
        boolean hasMore = fetched.size() > limit;
        List<ChefScheduledOrderView> items = hasMore ? fetched.subList(0, limit) : fetched;
        String nextCursor = hasMore && !items.isEmpty()
            ? ScheduledOrderCursorCodec.encode(new ScheduledOrderCursor(
                items.getLast().requestedFulfilmentAt(),
                items.getLast().scheduleRequestId(),
                items.getLast().orderId()
            ))
            : null;
        return new Page<>(items, nextCursor, hasMore);
    }

    @Transactional
    public KitchenScheduleResponseView respondAsChef(
        CravesPrincipal principal,
        UUID scheduleRequestId,
        UUID orderId,
        ChefScheduleResponseRequest request
    ) {
        requireRole(principal, "CHEF");
        ValidatedChefResponse validated = ScheduleValidation.validateChefResponse(request);
        ChefResponseRow current = lockChefResponse(scheduleRequestId, orderId);
        if (!current.chefIdentityId().equals(principal.identityId())) {
            throw OrderApiException.notFound("SCHEDULE_RESPONSE_NOT_FOUND", "Scheduled order response was not found");
        }
        KitchenResponseStatus desired = validated.action() == ChefResponseAction.ACCEPT
            ? KitchenResponseStatus.ACCEPTED
            : KitchenResponseStatus.REJECTED;
        if (current.status() == desired) {
            return loadKitchenResponse(scheduleRequestId, orderId);
        }
        if (current.scheduleStatus() != ScheduleStatus.PENDING_CHEF_CONFIRMATION
            || current.status() != KitchenResponseStatus.PENDING) {
            throw OrderApiException.conflict(
                "SCHEDULE_RESPONSE_NOT_PENDING",
                "This scheduled-order response is no longer pending"
            );
        }
        if (!current.requestedFulfilmentAt().isAfter(clock.instant())) {
            throw OrderApiException.conflict(
                "SCHEDULE_REQUEST_EXPIRED",
                "The requested fulfilment time has passed"
            );
        }
        if (current.version() != validated.expectedVersion()) {
            throw OrderApiException.conflict(
                "SCHEDULE_RESPONSE_VERSION_CONFLICT",
                "The scheduled-order response changed since it was loaded"
            );
        }

        int updated = jdbc.update("""
            UPDATE order_schema.scheduled_order_kitchen_response
               SET status = :status,
                   response_note = :note,
                   responded_at = now(),
                   version = version + 1
             WHERE schedule_request_id = :scheduleId
               AND order_id = :orderId
               AND status = 'PENDING'
               AND version = :expectedVersion
            """, new MapSqlParameterSource()
            .addValue("status", desired.name())
            .addValue("note", validated.responseNote())
            .addValue("scheduleId", scheduleRequestId)
            .addValue("orderId", orderId)
            .addValue("expectedVersion", validated.expectedVersion()));
        if (updated != 1) {
            throw OrderApiException.conflict(
                "SCHEDULE_RESPONSE_VERSION_CONFLICT",
                "The scheduled-order response changed since it was loaded"
            );
        }
        recomputeScheduleStatus(scheduleRequestId);
        return loadKitchenResponse(scheduleRequestId, orderId);
    }

    @Transactional(readOnly = true)
    public PaymentEligibilityResponse paymentEligibility(UUID checkoutId) {
        List<PaymentEligibilityRow> rows = jdbc.query("""
            SELECT c.id AS checkout_id,
                   c.status AS checkout_status,
                   c.fulfilment_mode,
                   c.schedule_request_id,
                   sr.status AS schedule_status,
                   sr.requested_fulfilment_at
              FROM order_schema.checkout c
              LEFT JOIN order_schema.scheduled_order_request sr
                ON sr.id = c.schedule_request_id
             WHERE c.id = :checkoutId
            """, new MapSqlParameterSource("checkoutId", checkoutId), (rs, rowNum) -> new PaymentEligibilityRow(
            rs.getObject("checkout_id", UUID.class),
            rs.getString("checkout_status"),
            rs.getString("fulfilment_mode"),
            rs.getObject("schedule_request_id", UUID.class),
            rs.getString("schedule_status") == null ? null : ScheduleStatus.valueOf(rs.getString("schedule_status")),
            instant(rs, "requested_fulfilment_at")
        ));
        if (rows.isEmpty()) {
            throw OrderApiException.notFound("CHECKOUT_NOT_FOUND", "Checkout was not found");
        }
        PaymentEligibilityRow row = rows.getFirst();
        if (!"PAYMENT_PENDING".equals(row.checkoutStatus())) {
            return eligibility(row, false, "CHECKOUT_NOT_PAYMENT_PENDING");
        }
        if ("ASAP".equals(row.fulfilmentMode())) {
            return eligibility(row, true, "ASAP_CHECKOUT");
        }
        if (!"SCHEDULED".equals(row.fulfilmentMode()) || row.scheduleRequestId() == null || row.scheduleStatus() == null) {
            return eligibility(row, false, "SCHEDULE_EVIDENCE_MISSING");
        }
        if (row.scheduleStatus() == ScheduleStatus.CANCELLED) {
            return eligibility(row, false, "SCHEDULE_CANCELLED");
        }
        if (row.scheduleStatus() == ScheduleStatus.REJECTED) {
            return eligibility(row, false, "SCHEDULE_REJECTED");
        }
        if (row.requestedFulfilmentAt() == null || !row.requestedFulfilmentAt().isAfter(clock.instant())) {
            return eligibility(row, false, "SCHEDULE_WINDOW_EXPIRED");
        }

        List<GateStatusRow> responses = jdbc.query("""
            SELECT payment_gate, status
              FROM order_schema.scheduled_order_kitchen_response
             WHERE schedule_request_id = :scheduleId
            """, new MapSqlParameterSource("scheduleId", row.scheduleRequestId()), (rs, rowNum) -> new GateStatusRow(
            PaymentGate.valueOf(rs.getString("payment_gate")),
            KitchenResponseStatus.valueOf(rs.getString("status"))
        ));
        if (responses.isEmpty()) {
            return eligibility(row, false, "SCHEDULE_KITCHEN_RESPONSES_MISSING");
        }
        Set<PaymentGate> gates = responses.stream().map(GateStatusRow::paymentGate).collect(Collectors.toSet());
        if (gates.size() != 1) {
            return eligibility(row, false, "SCHEDULE_PAYMENT_GATE_MISMATCH");
        }
        PaymentGate gate = gates.iterator().next();
        if (gate == PaymentGate.PAYMENT_BEFORE_CHEF_CONFIRMATION) {
            return eligibility(row, true, "SCHEDULE_POLICY_ALLOWS_PRECONFIRMATION_PAYMENT");
        }
        boolean allAccepted = responses.stream().allMatch(response -> response.status() == KitchenResponseStatus.ACCEPTED);
        boolean confirmed = row.scheduleStatus() == ScheduleStatus.CONFIRMED;
        return eligibility(
            row,
            allAccepted && confirmed,
            allAccepted && confirmed ? "ALL_CHEFS_CONFIRMED" : "CHEF_CONFIRMATION_PENDING"
        );
    }

    @Transactional
    public SchedulePolicyView upsertPolicy(
        CravesPrincipal principal,
        UUID kitchenId,
        SchedulePolicyRequest request,
        String adminReason
    ) {
        requireRole(principal, "ADMIN");
        String reason = ScheduleValidation.validateAdminReason(adminReason);
        PolicyRow existing = findPolicy(kitchenId, true);
        ValidatedPolicy validated = ScheduleValidation.validatePolicy(request, existing != null);
        int nextVersion = existing == null ? 1 : existing.version() + 1;
        if (existing != null && existing.version() != validated.expectedVersion()) {
            throw OrderApiException.conflict(
                "SCHEDULE_POLICY_VERSION_CONFLICT",
                "Schedule policy changed since it was loaded"
            );
        }

        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("kitchenId", kitchenId)
            .addValue("active", validated.active())
            .addValue("minLead", validated.minLeadMinutes())
            .addValue("maxHorizon", validated.maxHorizonMinutes())
            .addValue("paymentGate", validated.paymentGate().name())
            .addValue("version", nextVersion)
            .addValue("actorId", principal.identityId());
        if (existing == null) {
            jdbc.update("""
                INSERT INTO order_schema.scheduled_order_policy (
                    kitchen_id, active, min_lead_minutes, max_horizon_minutes,
                    payment_gate, version, updated_by_identity_id
                ) VALUES (
                    :kitchenId, :active, :minLead, :maxHorizon,
                    :paymentGate, :version, :actorId
                )
                """, parameters);
        } else {
            parameters.addValue("expectedVersion", existing.version());
            int updated = jdbc.update("""
                UPDATE order_schema.scheduled_order_policy
                   SET active = :active,
                       min_lead_minutes = :minLead,
                       max_horizon_minutes = :maxHorizon,
                       payment_gate = :paymentGate,
                       version = :version,
                       updated_by_identity_id = :actorId,
                       updated_at = now()
                 WHERE kitchen_id = :kitchenId
                   AND version = :expectedVersion
                """, parameters);
            if (updated != 1) {
                throw OrderApiException.conflict(
                    "SCHEDULE_POLICY_VERSION_CONFLICT",
                    "Schedule policy changed since it was loaded"
                );
            }
        }

        PolicyRow saved = requirePolicy(kitchenId, false);
        jdbc.update("""
            INSERT INTO order_schema.scheduled_order_policy_audit (
                id, kitchen_id, old_policy, new_policy,
                actor_identity_id, reason
            ) VALUES (
                :id, :kitchenId, CAST(:oldPolicy AS jsonb), CAST(:newPolicy AS jsonb),
                :actorId, :reason
            )
            """, new MapSqlParameterSource()
            .addValue("id", UUID.randomUUID())
            .addValue("kitchenId", kitchenId)
            .addValue("oldPolicy", existing == null ? null : policyJson(existing))
            .addValue("newPolicy", policyJson(saved))
            .addValue("actorId", principal.identityId())
            .addValue("reason", reason));
        return toPolicyView(saved);
    }

    @Transactional(readOnly = true)
    public SchedulePolicyView getPolicy(CravesPrincipal principal, UUID kitchenId) {
        requireRole(principal, "ADMIN");
        return toPolicyView(requirePolicy(kitchenId, false));
    }

    private ScheduleCapabilityResponse calculateCapability(
        CheckoutRow checkout,
        List<OrderRow> orders,
        Map<UUID, PolicyRow> policies
    ) {
        LinkedHashSet<String> blockers = new LinkedHashSet<>();
        if (!"PAYMENT_PENDING".equals(checkout.status())) {
            blockers.add("CHECKOUT_NOT_PAYMENT_PENDING");
        }
        if (orders.isEmpty()) {
            blockers.add("CHECKOUT_HAS_NO_ORDERS");
        }
        if (orders.stream().anyMatch(order -> !"PAYMENT_PENDING".equals(order.status()))) {
            blockers.add("ORDER_NOT_PAYMENT_PENDING");
        }
        for (OrderRow order : orders) {
            PolicyRow policy = policies.get(order.kitchenId());
            if (policy == null || !policy.active()) {
                blockers.add("SCHEDULE_POLICY_NOT_ACTIVE");
            }
        }
        List<PolicyRow> activePolicies = orders.stream()
            .map(order -> policies.get(order.kitchenId()))
            .filter(java.util.Objects::nonNull)
            .filter(PolicyRow::active)
            .toList();
        Set<PaymentGate> gates = activePolicies.stream().map(PolicyRow::paymentGate).collect(Collectors.toSet());
        if (gates.size() > 1) {
            blockers.add("SCHEDULE_PAYMENT_GATE_MISMATCH");
        }
        Integer effectiveMin = activePolicies.isEmpty()
            ? null
            : activePolicies.stream().mapToInt(PolicyRow::minLeadMinutes).max().orElseThrow();
        Integer effectiveMax = activePolicies.isEmpty()
            ? null
            : activePolicies.stream().mapToInt(PolicyRow::maxHorizonMinutes).min().orElseThrow();
        if (effectiveMin != null && effectiveMax != null && effectiveMax <= effectiveMin) {
            blockers.add("SCHEDULE_WINDOW_INTERSECTION_EMPTY");
        }
        PaymentGate gate = gates.size() == 1 ? gates.iterator().next() : null;
        return new ScheduleCapabilityResponse(
            checkout.id(),
            blockers.isEmpty(),
            effectiveMin,
            effectiveMax,
            gate,
            List.copyOf(blockers)
        );
    }

    private void validateRequestedTime(
        Instant requestedAt,
        Instant now,
        List<OrderRow> orders,
        Map<UUID, PolicyRow> policies
    ) {
        for (OrderRow order : orders) {
            PolicyRow policy = policies.get(order.kitchenId());
            Instant earliest = now.plus(Duration.ofMinutes(policy.minLeadMinutes()));
            Instant latest = now.plus(Duration.ofMinutes(policy.maxHorizonMinutes()));
            if (requestedAt.isBefore(earliest) || requestedAt.isAfter(latest)) {
                throw OrderApiException.conflict(
                    "SCHEDULE_TIME_OUTSIDE_CONFIGURED_WINDOW",
                    "Requested fulfilment time is outside a kitchen's configured scheduling window"
                );
            }
        }
    }

    private void recomputeScheduleStatus(UUID scheduleRequestId) {
        ResponseCounts counts = jdbc.query("""
            SELECT COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_count,
                   COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected_count,
                   COUNT(*) AS total_count
              FROM order_schema.scheduled_order_kitchen_response
             WHERE schedule_request_id = :scheduleId
            """, new MapSqlParameterSource("scheduleId", scheduleRequestId), (rs, rowNum) -> new ResponseCounts(
            rs.getInt("pending_count"),
            rs.getInt("rejected_count"),
            rs.getInt("total_count")
        )).getFirst();
        ScheduleStatus next = counts.rejected() > 0
            ? ScheduleStatus.REJECTED
            : counts.total() > 0 && counts.pending() == 0
                ? ScheduleStatus.CONFIRMED
                : ScheduleStatus.PENDING_CHEF_CONFIRMATION;
        jdbc.update("""
            UPDATE order_schema.scheduled_order_request
               SET status = :status,
                   version = version + 1,
                   updated_at = now()
             WHERE id = :scheduleId
               AND status = 'PENDING_CHEF_CONFIRMATION'
            """, new MapSqlParameterSource()
            .addValue("status", next.name())
            .addValue("scheduleId", scheduleRequestId));
    }

    private ScheduleRequestView loadSchedule(UUID scheduleId, UUID customerId) {
        List<ScheduleRow> rows = jdbc.query("""
            SELECT id, checkout_id, customer_identity_id,
                   requested_fulfilment_at, requested_timezone,
                   status, idempotency_key, request_fingerprint,
                   version, created_at, updated_at
              FROM order_schema.scheduled_order_request
             WHERE id = :scheduleId
               AND customer_identity_id = :customerId
            """, new MapSqlParameterSource()
            .addValue("scheduleId", scheduleId)
            .addValue("customerId", customerId), this::mapSchedule);
        if (rows.isEmpty()) {
            throw OrderApiException.notFound("SCHEDULE_REQUEST_NOT_FOUND", "Schedule request was not found");
        }
        ScheduleRow row = rows.getFirst();
        List<KitchenScheduleResponseView> responses = jdbc.query("""
            SELECT order_id, kitchen_id, status, payment_gate,
                   response_note, version, responded_at
              FROM order_schema.scheduled_order_kitchen_response
             WHERE schedule_request_id = :scheduleId
             ORDER BY kitchen_id, order_id
            """, new MapSqlParameterSource("scheduleId", scheduleId), (rs, rowNum) -> new KitchenScheduleResponseView(
            rs.getObject("order_id", UUID.class),
            rs.getObject("kitchen_id", UUID.class),
            KitchenResponseStatus.valueOf(rs.getString("status")),
            PaymentGate.valueOf(rs.getString("payment_gate")),
            rs.getString("response_note"),
            rs.getInt("version"),
            instant(rs, "responded_at")
        ));
        return new ScheduleRequestView(
            row.id(),
            row.checkoutId(),
            row.requestedFulfilmentAt(),
            row.requestedTimezone(),
            row.status(),
            row.version(),
            responses,
            row.createdAt(),
            row.updatedAt()
        );
    }

    private KitchenScheduleResponseView loadKitchenResponse(UUID scheduleId, UUID orderId) {
        List<KitchenScheduleResponseView> rows = jdbc.query("""
            SELECT order_id, kitchen_id, status, payment_gate,
                   response_note, version, responded_at
              FROM order_schema.scheduled_order_kitchen_response
             WHERE schedule_request_id = :scheduleId
               AND order_id = :orderId
            """, new MapSqlParameterSource()
            .addValue("scheduleId", scheduleId)
            .addValue("orderId", orderId), (rs, rowNum) -> new KitchenScheduleResponseView(
            rs.getObject("order_id", UUID.class),
            rs.getObject("kitchen_id", UUID.class),
            KitchenResponseStatus.valueOf(rs.getString("status")),
            PaymentGate.valueOf(rs.getString("payment_gate")),
            rs.getString("response_note"),
            rs.getInt("version"),
            instant(rs, "responded_at")
        ));
        if (rows.isEmpty()) {
            throw OrderApiException.notFound("SCHEDULE_RESPONSE_NOT_FOUND", "Scheduled order response was not found");
        }
        return rows.getFirst();
    }

    private CheckoutRow requireCheckout(UUID checkoutId, UUID customerId, boolean lock) {
        String sql = """
            SELECT id, customer_identity_id, status, fulfilment_mode, schedule_request_id
              FROM order_schema.checkout
             WHERE id = :checkoutId
               AND customer_identity_id = :customerId
            """ + (lock ? " FOR UPDATE" : "");
        List<CheckoutRow> rows = jdbc.query(sql, new MapSqlParameterSource()
            .addValue("checkoutId", checkoutId)
            .addValue("customerId", customerId), (rs, rowNum) -> new CheckoutRow(
            rs.getObject("id", UUID.class),
            rs.getObject("customer_identity_id", UUID.class),
            rs.getString("status"),
            rs.getString("fulfilment_mode"),
            rs.getObject("schedule_request_id", UUID.class)
        ));
        if (rows.isEmpty()) {
            throw OrderApiException.notFound("CHECKOUT_NOT_FOUND", "Checkout was not found");
        }
        return rows.getFirst();
    }

    private List<OrderRow> loadOrders(UUID checkoutId, boolean lock) {
        String sql = """
            SELECT id, kitchen_id, chef_identity_id, status
              FROM order_schema.customer_order
             WHERE checkout_id = :checkoutId
             ORDER BY id
            """ + (lock ? " FOR UPDATE" : "");
        return jdbc.query(sql, new MapSqlParameterSource("checkoutId", checkoutId), (rs, rowNum) -> new OrderRow(
            rs.getObject("id", UUID.class),
            rs.getObject("kitchen_id", UUID.class),
            rs.getObject("chef_identity_id", UUID.class),
            rs.getString("status")
        ));
    }

    private Map<UUID, PolicyRow> loadPolicies(Collection<UUID> kitchenIds, boolean lock) {
        if (kitchenIds.isEmpty()) {
            return Map.of();
        }
        String sql = """
            SELECT kitchen_id, active, min_lead_minutes, max_horizon_minutes,
                   payment_gate, version, updated_at
              FROM order_schema.scheduled_order_policy
             WHERE kitchen_id IN (:kitchenIds)
            """ + (lock ? " FOR SHARE" : "");
        return jdbc.query(sql, new MapSqlParameterSource("kitchenIds", kitchenIds), rs -> {
            Map<UUID, PolicyRow> values = new LinkedHashMap<>();
            while (rs.next()) {
                PolicyRow row = mapPolicy(rs, 0);
                values.put(row.kitchenId(), row);
            }
            return Map.copyOf(values);
        });
    }

    private PolicyRow findPolicy(UUID kitchenId, boolean lock) {
        String sql = """
            SELECT kitchen_id, active, min_lead_minutes, max_horizon_minutes,
                   payment_gate, version, updated_at
              FROM order_schema.scheduled_order_policy
             WHERE kitchen_id = :kitchenId
            """ + (lock ? " FOR UPDATE" : "");
        List<PolicyRow> rows = jdbc.query(sql, new MapSqlParameterSource("kitchenId", kitchenId), this::mapPolicy);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private PolicyRow requirePolicy(UUID kitchenId, boolean lock) {
        PolicyRow row = findPolicy(kitchenId, lock);
        if (row == null) {
            throw OrderApiException.notFound("SCHEDULE_POLICY_NOT_FOUND", "Schedule policy was not found");
        }
        return row;
    }

    private ScheduleRow findByIdempotency(UUID customerId, String key, boolean lock) {
        String sql = """
            SELECT id, checkout_id, customer_identity_id,
                   requested_fulfilment_at, requested_timezone,
                   status, idempotency_key, request_fingerprint,
                   version, created_at, updated_at
              FROM order_schema.scheduled_order_request
             WHERE customer_identity_id = :customerId
               AND idempotency_key = :idempotencyKey
            """ + (lock ? " FOR UPDATE" : "");
        List<ScheduleRow> rows = jdbc.query(sql, new MapSqlParameterSource()
            .addValue("customerId", customerId)
            .addValue("idempotencyKey", key), this::mapSchedule);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private ScheduleRow requireSchedule(UUID scheduleId, boolean lock) {
        String sql = """
            SELECT id, checkout_id, customer_identity_id,
                   requested_fulfilment_at, requested_timezone,
                   status, idempotency_key, request_fingerprint,
                   version, created_at, updated_at
              FROM order_schema.scheduled_order_request
             WHERE id = :scheduleId
            """ + (lock ? " FOR UPDATE" : "");
        List<ScheduleRow> rows = jdbc.query(sql, new MapSqlParameterSource("scheduleId", scheduleId), this::mapSchedule);
        if (rows.isEmpty()) {
            throw OrderApiException.notFound("SCHEDULE_REQUEST_NOT_FOUND", "Schedule request was not found");
        }
        return rows.getFirst();
    }

    private ChefResponseRow lockChefResponse(UUID scheduleId, UUID orderId) {
        List<ChefResponseRow> rows = jdbc.query("""
            SELECT resp.schedule_request_id,
                   resp.order_id,
                   resp.kitchen_id,
                   resp.chef_identity_id,
                   resp.status,
                   resp.payment_gate,
                   resp.response_note,
                   resp.version,
                   resp.responded_at,
                   sr.status AS schedule_status,
                   sr.requested_fulfilment_at
              FROM order_schema.scheduled_order_kitchen_response resp
              JOIN order_schema.scheduled_order_request sr
                ON sr.id = resp.schedule_request_id
             WHERE resp.schedule_request_id = :scheduleId
               AND resp.order_id = :orderId
             FOR UPDATE OF resp, sr
            """, new MapSqlParameterSource()
            .addValue("scheduleId", scheduleId)
            .addValue("orderId", orderId), (rs, rowNum) -> new ChefResponseRow(
            rs.getObject("schedule_request_id", UUID.class),
            rs.getObject("order_id", UUID.class),
            rs.getObject("kitchen_id", UUID.class),
            rs.getObject("chef_identity_id", UUID.class),
            KitchenResponseStatus.valueOf(rs.getString("status")),
            PaymentGate.valueOf(rs.getString("payment_gate")),
            rs.getString("response_note"),
            rs.getInt("version"),
            instant(rs, "responded_at"),
            ScheduleStatus.valueOf(rs.getString("schedule_status")),
            instant(rs, "requested_fulfilment_at")
        ));
        if (rows.isEmpty()) {
            throw OrderApiException.notFound("SCHEDULE_RESPONSE_NOT_FOUND", "Scheduled order response was not found");
        }
        return rows.getFirst();
    }

    private ScheduleRow mapSchedule(ResultSet rs, int rowNum) throws SQLException {
        return new ScheduleRow(
            rs.getObject("id", UUID.class),
            rs.getObject("checkout_id", UUID.class),
            rs.getObject("customer_identity_id", UUID.class),
            instant(rs, "requested_fulfilment_at"),
            rs.getString("requested_timezone"),
            ScheduleStatus.valueOf(rs.getString("status")),
            rs.getString("idempotency_key"),
            rs.getString("request_fingerprint"),
            rs.getInt("version"),
            instant(rs, "created_at"),
            instant(rs, "updated_at")
        );
    }

    private PolicyRow mapPolicy(ResultSet rs, int rowNum) throws SQLException {
        return new PolicyRow(
            rs.getObject("kitchen_id", UUID.class),
            rs.getBoolean("active"),
            rs.getInt("min_lead_minutes"),
            rs.getInt("max_horizon_minutes"),
            PaymentGate.valueOf(rs.getString("payment_gate")),
            rs.getInt("version"),
            instant(rs, "updated_at")
        );
    }

    private ChefScheduledOrderView mapChefQueue(ResultSet rs, int rowNum) throws SQLException {
        return new ChefScheduledOrderView(
            rs.getObject("schedule_request_id", UUID.class),
            rs.getObject("checkout_id", UUID.class),
            rs.getObject("order_id", UUID.class),
            rs.getObject("kitchen_id", UUID.class),
            instant(rs, "requested_fulfilment_at"),
            rs.getString("requested_timezone"),
            ScheduleStatus.valueOf(rs.getString("schedule_status")),
            KitchenResponseStatus.valueOf(rs.getString("response_status")),
            PaymentGate.valueOf(rs.getString("payment_gate")),
            rs.getString("response_note"),
            rs.getInt("response_version"),
            instant(rs, "responded_at"),
            instant(rs, "created_at")
        );
    }

    private String policyJson(PolicyRow policy) {
        try {
            return objectMapper.writeValueAsString(Map.of(
                "kitchenId", policy.kitchenId().toString(),
                "active", policy.active(),
                "minLeadMinutes", policy.minLeadMinutes(),
                "maxHorizonMinutes", policy.maxHorizonMinutes(),
                "paymentGate", policy.paymentGate().name(),
                "version", policy.version()
            ));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize schedule policy audit", exception);
        }
    }

    private static Set<UUID> kitchenIds(List<OrderRow> orders) {
        return orders.stream().map(OrderRow::kitchenId).collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private static SchedulePolicyView toPolicyView(PolicyRow row) {
        return new SchedulePolicyView(
            row.kitchenId(),
            row.active(),
            row.minLeadMinutes(),
            row.maxHorizonMinutes(),
            row.paymentGate(),
            row.version(),
            row.updatedAt()
        );
    }

    private static PaymentEligibilityResponse eligibility(
        PaymentEligibilityRow row,
        boolean eligible,
        String reasonCode
    ) {
        return new PaymentEligibilityResponse(
            row.checkoutId(),
            row.fulfilmentMode(),
            eligible,
            reasonCode,
            row.scheduleRequestId(),
            row.scheduleStatus()
        );
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static void requireRole(CravesPrincipal principal, String... roles) {
        if (principal == null || !principal.hasAnyRole(roles)) {
            throw new OrderApiException(HttpStatus.FORBIDDEN, "ROLE_REQUIRED", "Required role is missing");
        }
    }

    private record CheckoutRow(
        UUID id,
        UUID customerIdentityId,
        String status,
        String fulfilmentMode,
        UUID scheduleRequestId
    ) {
    }

    private record OrderRow(UUID id, UUID kitchenId, UUID chefIdentityId, String status) {
    }

    private record PolicyRow(
        UUID kitchenId,
        boolean active,
        int minLeadMinutes,
        int maxHorizonMinutes,
        PaymentGate paymentGate,
        int version,
        Instant updatedAt
    ) {
    }

    private record ScheduleRow(
        UUID id,
        UUID checkoutId,
        UUID customerIdentityId,
        Instant requestedFulfilmentAt,
        String requestedTimezone,
        ScheduleStatus status,
        String idempotencyKey,
        String requestFingerprint,
        int version,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    private record ChefResponseRow(
        UUID scheduleRequestId,
        UUID orderId,
        UUID kitchenId,
        UUID chefIdentityId,
        KitchenResponseStatus status,
        PaymentGate paymentGate,
        String responseNote,
        int version,
        Instant respondedAt,
        ScheduleStatus scheduleStatus,
        Instant requestedFulfilmentAt
    ) {
    }

    private record PaymentEligibilityRow(
        UUID checkoutId,
        String checkoutStatus,
        String fulfilmentMode,
        UUID scheduleRequestId,
        ScheduleStatus scheduleStatus,
        Instant requestedFulfilmentAt
    ) {
    }

    private record GateStatusRow(PaymentGate paymentGate, KitchenResponseStatus status) {
    }

    private record ResponseCounts(int pending, int rejected, int total) {
    }
}
