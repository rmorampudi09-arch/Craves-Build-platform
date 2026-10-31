package in.craves.advanced.orderamendments;

import in.craves.advanced.orderamendments.OrderAmendmentDtos.AmendmentParty;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.AmendmentStatus;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentChange;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentLine;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentRequest;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentView;
import in.craves.advanced.orderamendments.OrderAmendmentRepository.Row;
import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.clients.OrderGateway;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Changes to a placed order that both sides agree to: the customer asks and the kitchen's chef answers, or the chef proposes
 * (for example a substitution) and the customer answers. Order service is read with the caller's own token before any
 * database lock; nothing here charges, refunds or edits the order itself (M24 applies accepted changes).
 */
@Service
public class OrderAmendmentService implements PersonalDataContributor {
    static final UUID ERASED = new UUID(0, 0);
    /** Proposals each side may make on one order (any outcome), so neither side can flood the other or use up the other's turns. */
    static final int MAX_PER_SIDE = 5;
    /** shortcut: lists return the newest (or for the chef the oldest waiting) 100; add cursor paging if people keep more. */
    static final int LIST_LIMIT = 100;
    private final OrderAmendmentRepository repository;
    private final OrderGateway orders;
    private final CatalogGateway catalog;
    private final Audit audit;
    private final Clock clock;
    private final TransactionTemplate tx;
    private final Duration answerWindow;

    public OrderAmendmentService(OrderAmendmentRepository repository, OrderGateway orders, CatalogGateway catalog, Audit audit, Clock clock,
                                 PlatformTransactionManager transactions,
                                 @Value("${CRAVES_ADV_AMENDMENT_ANSWER_MINUTES:10}") String answerMinutes) {
        this.repository = repository;
        this.orders = orders;
        this.catalog = catalog;
        this.audit = audit;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactions);
        this.answerWindow = Duration.ofMinutes(OrderAmendmentRules.answerMinutes(answerMinutes));
    }

    // The customer

    public OrderAmendmentView propose(UUID customer, String customerToken, UUID orderId, OrderAmendmentRequest request) {
        Order order = orders.customerOrder(customerToken, orderId).filter(found -> found.customerId().equals(customer))
                .orElseThrow(OrderAmendmentService::orderNotFound);
        return propose(AmendmentParty.CUSTOMER, customer, order, request);
    }

    /** Accepts a chef's proposal (the version the customer saw) while the order is still in the kitchen. */
    public OrderAmendmentView accept(UUID customer, String customerToken, UUID amendmentId, long expectedVersion) {
        Row row = customersToAnswer(customer, amendmentId);
        Order order = orders.customerOrder(customerToken, row.orderId()).orElseThrow(OrderAmendmentService::orderNotFound);
        return close(row, customer, order, AmendmentStatus.ACCEPTED, null, expectedVersion);
    }

    public OrderAmendmentView decline(UUID customer, UUID amendmentId, String reason) {
        return close(customersToAnswer(customer, amendmentId), customer, null, AmendmentStatus.DECLINED, reason, null);
    }

    public OrderAmendmentView withdraw(UUID customer, UUID amendmentId) {
        Row row = repository.find(amendmentId, false).filter(found -> found.proposedBy() == AmendmentParty.CUSTOMER && found.customerId().equals(customer))
                .orElseThrow(OrderAmendmentService::amendmentNotFound);
        return close(row, customer, null, AmendmentStatus.WITHDRAWN, null, null);
    }

    public List<OrderAmendmentView> forCustomerOrder(UUID customer, UUID orderId) {
        Instant now = clock.instant();
        return repository.ofOrder(orderId).stream().filter(row -> row.customerId().equals(customer)).map(row -> view(row, now)).toList();
    }

    public List<OrderAmendmentView> mine(UUID customer) {
        Instant now = clock.instant();
        return repository.ofCustomer(customer, LIST_LIMIT).stream().map(row -> view(row, now)).toList();
    }

    // The kitchen's chef

    public OrderAmendmentView chefPropose(UUID chef, String chefToken, UUID orderId, OrderAmendmentRequest request) {
        Order order = orders.chefOrder(chefToken, orderId).orElseThrow(OrderAmendmentService::orderNotFound);
        return propose(AmendmentParty.CHEF, chef, order, request);
    }

    public OrderAmendmentView chefAccept(UUID chef, String chefToken, UUID amendmentId, long expectedVersion) {
        Row row = chefsToAnswer(amendmentId);
        // Another kitchen's proposal answers like a missing one, so amendment ids reveal nothing.
        Order order = orders.chefOrder(chefToken, row.orderId()).orElseThrow(OrderAmendmentService::amendmentNotFound);
        return close(row, chef, order, AmendmentStatus.ACCEPTED, null, expectedVersion);
    }

    public OrderAmendmentView chefDecline(UUID chef, String chefToken, UUID amendmentId, String reason) {
        Row row = chefsToAnswer(amendmentId);
        orders.chefOrder(chefToken, row.orderId()).orElseThrow(OrderAmendmentService::amendmentNotFound);
        return close(row, chef, null, AmendmentStatus.DECLINED, reason, null);
    }

    public OrderAmendmentView chefWithdraw(UUID chef, UUID amendmentId) {
        Row row = repository.find(amendmentId, false).filter(found -> found.proposedBy() == AmendmentParty.CHEF && found.proposerId().equals(chef))
                .orElseThrow(OrderAmendmentService::amendmentNotFound);
        return close(row, chef, null, AmendmentStatus.WITHDRAWN, null, null);
    }

    public List<OrderAmendmentView> forChefOrder(String chefToken, UUID orderId) {
        orders.chefOrder(chefToken, orderId).orElseThrow(OrderAmendmentService::orderNotFound);
        Instant now = clock.instant();
        return repository.ofOrder(orderId).stream().map(row -> view(row, now)).toList();
    }

    /** Customer requests waiting for this chef's answer, oldest first. */
    public List<OrderAmendmentView> chefPending(String chefToken) {
        Set<UUID> kitchens = catalog.chefMenuItems(chefToken).values().stream().map(MenuItem::kitchenId).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Instant now = clock.instant();
        return repository.awaitingKitchens(kitchens, now, LIST_LIMIT).stream().map(row -> view(row, now)).toList();
    }

    // Staff (support and disputes; M24 reads accepted changes from here)

    public List<OrderAmendmentView> forStaff(UUID orderId) {
        Instant now = clock.instant();
        return repository.ofOrder(orderId).stream().map(row -> view(row, now)).toList();
    }

    @Override
    public String moduleId() {
        return OrderAmendmentsModule.ID;
    }

    @Override
    public Map<String, Object> export(UUID person) {
        Instant now = clock.instant();
        return Map.of("amendments", repository.involving(person).stream().map(row -> view(row, now)).toList());
    }

    /** Waits for a proposal on the person's orders being made right now (same customer lock), so none escapes the erasure. */
    @Override
    public int erase(UUID person) {
        return tx.execute(status -> {
            repository.lockCustomer(person);
            return repository.erase(person, ERASED, clock.instant());
        });
    }

    private OrderAmendmentView propose(AmendmentParty party, UUID actor, Order order, OrderAmendmentRequest request) {
        Set<String> allowed = party == AmendmentParty.CUSTOMER ? OrderAmendmentRules.CUSTOMER_MAY_PROPOSE : OrderAmendmentRules.CHEF_MAY_PROPOSE;
        if (!allowed.contains(order.status())) throw notAmendable(order);
        Map<UUID, MenuItem> substitutes = substitutes(order.kitchenId(), request.changes()); // asks Catalog before any lock
        UUID id = tx.execute(status -> {
            repository.lockCustomer(order.customerId()); // always before the order lock: erasure takes only this one
            repository.lockOrder(order.id());
            Instant now = clock.instant();
            List<Row> existing = repository.ofOrder(order.id());
            Optional<Row> open = existing.stream().filter(row -> row.status() == AmendmentStatus.PROPOSED && now.isBefore(row.expiresAt())).findFirst();
            if (open.isPresent()) {
                throw new ApiProblem(409, "AMENDMENT_PENDING", "A change to this order is waiting for an answer", List.of(open.get().id().toString()));
            }
            if (existing.stream().filter(row -> row.proposedBy() == party).count() >= MAX_PER_SIDE) {
                throw ApiProblem.conflict("TOO_MANY_AMENDMENTS", "This order has been changed too often; contact support");
            }
            List<List<OrderAmendmentLine>> accepted = existing.stream().filter(row -> row.status() == AmendmentStatus.ACCEPTED).map(Row::changes).toList();
            List<OrderAmendmentLine> changes = OrderAmendmentRules.plan(OrderAmendmentRules.effective(order.lines(), accepted), request.changes(), substitutes);
            // After the highest number ever used, not the count: erasure may have deleted earlier proposals.
            int seq = existing.stream().mapToInt(Row::seq).max().orElse(0) + 1;
            Row row = new Row(UUID.randomUUID(), order.id(), seq, order.kitchenId(), order.customerId(), party, actor, changes,
                    OrderAmendmentRules.foodDelta(changes), OrderAmendmentRules.blankToNull(request.note()), AmendmentStatus.PROPOSED, null, null, null,
                    now.plus(answerWindow), 1, now);
            repository.insert(row, now);
            audit.record(OrderAmendmentsModule.ID, actor, "AMENDMENT_PROPOSED", "order_amendment", row.id(), Map.of("orderId", order.id(),
                    "proposedBy", party.name(), "foodDeltaPaise", row.foodDeltaPaise(), "kinds", changes.stream().map(line -> line.kind().name()).toList()));
            return row.id();
        });
        return view(repository.find(id, false).orElseThrow(), clock.instant());
    }

    /**
     * Accepts (order: read just before with the answerer's token), declines or withdraws an open proposal; repeating the same
     * answer is harmless, even once the order has moved on.
     */
    private OrderAmendmentView close(Row found, UUID actor, Order order, AmendmentStatus outcome, String reason, Long expectedVersion) {
        tx.executeWithoutResult(status -> {
            repository.lockOrder(found.orderId());
            Row row = repository.find(found.id(), true).orElseThrow(OrderAmendmentService::amendmentNotFound);
            if (row.status() == outcome && actor.equals(row.answeredBy())) return;
            if (order != null && !OrderAmendmentRules.STILL_IN_KITCHEN.contains(order.status())) throw notAmendable(order);
            if (expectedVersion != null && row.version() != expectedVersion) {
                throw new ApiProblem(412, "VERSION_MISMATCH", "This change was edited since you loaded it; reload and try again");
            }
            if (row.status() != AmendmentStatus.PROPOSED) {
                throw ApiProblem.conflict("AMENDMENT_CLOSED", "This change was already " + row.status().name().toLowerCase());
            }
            Instant now = clock.instant();
            // A later proposal means some replica already judged this one lapsed and planned the next on top of the lines without it;
            // accepting it now could take the same line twice, whatever this replica's clock says.
            if (outcome == AmendmentStatus.ACCEPTED && (!now.isBefore(row.expiresAt())
                    || repository.ofOrder(row.orderId()).stream().anyMatch(other -> other.seq() > row.seq()))) {
                throw ApiProblem.conflict("AMENDMENT_EXPIRED", "This change was not answered in time; propose it again");
            }
            repository.answer(row.id(), outcome, OrderAmendmentRules.blankToNull(reason), actor, now);
            audit.record(OrderAmendmentsModule.ID, actor, "AMENDMENT_" + outcome.name(), "order_amendment", row.id(),
                    Map.of("orderId", row.orderId(), "foodDeltaPaise", row.foodDeltaPaise()));
        });
        return view(repository.find(found.id(), false).orElseThrow(), clock.instant());
    }

    /** Dishes Catalog sells right now from the order's kitchen, for the REPLACE changes. */
    private Map<UUID, MenuItem> substitutes(UUID kitchenId, List<OrderAmendmentChange> changes) {
        Set<UUID> wanted = changes.stream().map(OrderAmendmentChange::substituteMenuItemId).filter(Objects::nonNull).collect(Collectors.toSet());
        if (wanted.isEmpty()) return Map.of();
        return catalog.purchasable(wanted).values().stream().filter(item -> kitchenId.equals(item.kitchenId()) && item.pricePaise() != null)
                .collect(Collectors.toMap(MenuItem::id, item -> item));
    }

    private Row customersToAnswer(UUID customer, UUID amendmentId) {
        return repository.find(amendmentId, false).filter(row -> row.proposedBy() == AmendmentParty.CHEF && row.customerId().equals(customer))
                .orElseThrow(OrderAmendmentService::amendmentNotFound);
    }

    private Row chefsToAnswer(UUID amendmentId) {
        return repository.find(amendmentId, false).filter(row -> row.proposedBy() == AmendmentParty.CUSTOMER)
                .orElseThrow(OrderAmendmentService::amendmentNotFound);
    }

    private static OrderAmendmentView view(Row row, Instant now) {
        boolean expired = row.status() == AmendmentStatus.PROPOSED && !now.isBefore(row.expiresAt());
        return new OrderAmendmentView(row.id(), row.orderId(), row.kitchenId(), row.proposedBy(), row.changes(), row.foodDeltaPaise(), row.note(),
                row.status(), expired, row.expiresAt(), row.answerNote(), row.answeredAt(), row.version(), row.createdAt());
    }

    private static ApiProblem notAmendable(Order order) {
        return new ApiProblem(409, "ORDER_NOT_AMENDABLE", "This order can no longer be changed", List.of("status: " + order.status()));
    }

    private static ApiProblem orderNotFound() {
        return ApiProblem.notFound("ORDER_NOT_FOUND", "No such order");
    }

    private static ApiProblem amendmentNotFound() {
        return ApiProblem.notFound("AMENDMENT_NOT_FOUND", "No such order change");
    }
}
