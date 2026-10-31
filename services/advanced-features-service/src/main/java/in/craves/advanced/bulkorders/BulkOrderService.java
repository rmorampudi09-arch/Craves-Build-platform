package in.craves.advanced.bulkorders;

import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderLine;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderPolicy;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderPolicyView;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderStatus;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderView;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkQuote;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkQuoteLine;
import in.craves.advanced.bulkorders.BulkOrderDtos.NewBulkOrder;
import in.craves.advanced.bulkorders.BulkOrderRepository.Row;
import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BulkOrderService implements PersonalDataContributor {
    static final UUID ERASED = new UUID(0, 0);
    /** Open requests (asked or quoted) one person may have at once, so no one can flood chefs with requests. */
    static final int MAX_OPEN_PER_PERSON = 10;
    static final int MAX_PORTIONS_PER_DISH = 5000;
    /** shortcut: lists return the newest 100; add cursor paging if people or kitchens keep more. */
    static final int LIST_LIMIT = 100;
    private final BulkOrderRepository repository;
    private final CatalogGateway catalog;
    private final Audit audit;
    private final Clock clock;

    public BulkOrderService(BulkOrderRepository repository, CatalogGateway catalog, Audit audit, Clock clock) {
        this.repository = repository;
        this.catalog = catalog;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public BulkOrderPolicyView policy() {
        return repository.policy().orElseThrow(() -> ApiProblem.notFound("BULK_POLICY_NOT_SET", "Bulk orders are not open yet"));
    }

    @Transactional
    public BulkOrderPolicyView setPolicy(UUID staff, BulkOrderPolicy request) {
        if (request.minLeadHours() > request.maxDaysAhead() * 24) {
            throw ApiProblem.unprocessable("POLICY_IMPOSSIBLE", "The minimum notice is longer than how far ahead bookings may be made");
        }
        long version;
        try {
            version = repository.insertPolicy(request, staff, clock.instant());
        } catch (DuplicateKeyException concurrent) {
            throw ApiProblem.conflict("POLICY_CHANGED", "The rules changed just now; reload and try again");
        }
        audit.record(BulkOrdersModule.ID, staff, "POLICY_SET", "policy", version, Map.of("policy", request));
        return policy();
    }

    /** Not one transaction on purpose: Catalog is asked first, then the request is one insert. */
    public BulkOrderView create(UUID customer, NewBulkOrder request) {
        BulkOrderPolicyView policy = repository.policy()
                .orElseThrow(() -> ApiProblem.unavailable("BULK_ORDERS_NOT_CONFIGURED", "Bulk orders are not open yet"));
        Map<UUID, Integer> quantities = new LinkedHashMap<>();
        request.items().forEach(item -> quantities.merge(item.menuItemId(), item.quantity(), Integer::sum));
        List<String> tooMany = quantities.entrySet().stream().filter(entry -> entry.getValue() > MAX_PORTIONS_PER_DISH)
                .map(entry -> entry.getKey().toString()).toList();
        if (!tooMany.isEmpty()) {
            throw new ApiProblem(422, "QUANTITY_TOO_LARGE", "At most " + MAX_PORTIONS_PER_DISH + " portions of one dish per request", tooMany);
        }
        int portions = quantities.values().stream().mapToInt(Integer::intValue).sum();
        if (portions < policy.minPortions()) {
            throw new ApiProblem(422, "BELOW_MIN_PORTIONS", "Bulk orders start at " + policy.minPortions() + " portions",
                    List.of("minPortions: " + policy.minPortions()));
        }
        Instant now = clock.instant();
        String timing = BulkOrderRules.timingProblem(request.eventAt(), now, policy.minLeadHours(), policy.maxDaysAhead());
        if (timing != null) {
            throw new ApiProblem(422, timing, "Bulk orders need " + policy.minLeadHours() + " hours' notice and can be booked up to "
                    + policy.maxDaysAhead() + " days ahead", List.of("minLeadHours: " + policy.minLeadHours(), "maxDaysAhead: " + policy.maxDaysAhead()));
        }
        // shortcut: the open-request count and the insert are not atomic, so requests sent at the same moment can each pass the cap.
        if (repository.openCount(customer, now) >= MAX_OPEN_PER_PERSON) {
            throw ApiProblem.conflict("TOO_MANY_OPEN_REQUESTS", "You have " + MAX_OPEN_PER_PERSON + " open bulk requests; wait for answers or cancel one");
        }
        List<BulkOrderLine> lines = new ArrayList<>();
        List<String> foreign = new ArrayList<>();
        for (Map.Entry<UUID, Integer> wanted : quantities.entrySet()) {
            Optional<MenuItem> item = catalog.menuItem(wanted.getKey());
            if (item.isEmpty() || !request.kitchenId().equals(item.get().kitchenId())) {
                foreign.add(wanted.getKey().toString());
            } else {
                lines.add(new BulkOrderLine(wanted.getKey(), item.get().name(), wanted.getValue(), item.get().pricePaise(), null));
            }
        }
        if (!foreign.isEmpty()) {
            throw new ApiProblem(422, "NOT_THIS_KITCHENS_DISHES", "Every dish must be on this kitchen's menu today", foreign);
        }
        Row row = new Row(UUID.randomUUID(), customer, request.kitchenId(), request.eventAt().truncatedTo(ChronoUnit.MICROS), request.guests(),
                blankToNull(request.notes()), lines, BulkOrderStatus.REQUESTED, null, null, null, null, null, null, 1, now);
        repository.insert(row, policy.version(), now);
        return view(repository.find(row.id(), false).orElseThrow(), now);
    }

    @Transactional(readOnly = true)
    public List<BulkOrderView> mine(UUID customer) {
        Instant now = clock.instant();
        return repository.ofCustomer(customer, LIST_LIMIT).stream().map(row -> view(row, now)).toList();
    }

    @Transactional(readOnly = true)
    public BulkOrderView get(UUID customer, UUID id) {
        return view(own(customer, id, false), clock.instant());
    }

    /** Accepts the quote the customer saw (expectedVersion); placing and paying the order with its deposit is M24. */
    @Transactional
    public BulkOrderView accept(UUID customer, UUID id, long expectedVersion) {
        Row row = own(customer, id, true);
        if (row.version() != expectedVersion) throw versionMismatch();
        if (row.status() != BulkOrderStatus.QUOTED) throw ApiProblem.conflict("BULK_ORDER_NOT_QUOTED", "Only a quoted request can be accepted");
        Instant now = clock.instant();
        if (BulkOrderRules.expired(row.status(), row.eventAt(), row.quoteValidUntil(), now)) {
            throw ApiProblem.conflict("QUOTE_EXPIRED", "This quote has expired; ask the chef for a new one");
        }
        repository.setStatus(id, BulkOrderStatus.ACCEPTED, null, now);
        return view(repository.find(id, false).orElseThrow(), now);
    }

    @Transactional
    public BulkOrderView cancel(UUID customer, UUID id) {
        Row row = own(customer, id, true);
        if (row.status() == BulkOrderStatus.ACCEPTED) {
            throw ApiProblem.conflict("BULK_ORDER_ACCEPTED", "An accepted bulk order is cancelled through its order");
        }
        Instant now = clock.instant();
        if (row.status() == BulkOrderStatus.REQUESTED || row.status() == BulkOrderStatus.QUOTED) {
            repository.setStatus(id, BulkOrderStatus.CANCELLED, null, now);
        }
        return view(repository.find(id, false).orElseThrow(), now);
    }

    /** Not one transaction on purpose: Catalog names the chef's kitchen first. */
    public List<BulkOrderView> chefRequests(String chefToken) {
        Optional<UUID> kitchen = catalog.chefMenuItems(chefToken).values().stream().map(MenuItem::kitchenId).filter(java.util.Objects::nonNull)
                .findFirst();
        Instant now = clock.instant();
        return kitchen.map(id -> repository.ofKitchen(id, LIST_LIMIT).stream().map(row -> view(row, now)).toList()).orElse(List.of());
    }

    /** The chef prices every requested dish; the deposit is the staff-set share of the total. A new quote replaces the last one. */
    @Transactional
    public BulkOrderView quote(UUID chef, String chefToken, UUID id, BulkQuote request) {
        ownKitchen(chefToken, id); // asks Catalog before the row lock
        BulkOrderPolicyView policy = repository.policy().orElseThrow();
        Row row = repository.find(id, true).orElseThrow(BulkOrderService::notFound);
        if (row.version() != request.expectedVersion()) throw versionMismatch();
        Instant now = clock.instant();
        if ((row.status() != BulkOrderStatus.REQUESTED && row.status() != BulkOrderStatus.QUOTED) || !now.isBefore(row.eventAt())) {
            throw ApiProblem.conflict("BULK_ORDER_CLOSED", "This request can no longer be quoted");
        }
        if (!BulkOrderRules.pricesEveryDishOnce(row.lines(), request.lines())) {
            throw ApiProblem.badRequest("QUOTE_LINES_MISMATCH", "Price every requested dish exactly once");
        }
        if (!request.validUntil().isAfter(now) || request.validUntil().isAfter(row.eventAt())) {
            throw ApiProblem.badRequest("INVALID_VALID_UNTIL", "The quote must stay valid for a while and end no later than the event");
        }
        Map<UUID, Long> prices = request.lines().stream().collect(Collectors.toMap(BulkQuoteLine::menuItemId, BulkQuoteLine::unitPricePaise));
        List<BulkOrderLine> priced = row.lines().stream().map(line -> new BulkOrderLine(line.menuItemId(), line.name(), line.quantity(),
                line.listPricePaise(), prices.get(line.menuItemId()))).toList();
        long total = BulkOrderRules.total(priced);
        if (total <= 0) throw ApiProblem.badRequest("QUOTE_TOTAL_ZERO", "A quote must cost something");
        long deposit = BulkOrderRules.deposit(total, policy.depositPercent());
        repository.quote(id, priced, total, deposit, policy.depositPercent(), policy.version(), request.validUntil(), blankToNull(request.note()), now);
        audit.record(BulkOrdersModule.ID, chef, "QUOTED", "bulk_order", id,
                Map.of("totalPaise", total, "depositPaise", deposit, "validUntil", request.validUntil().toString()));
        return view(repository.find(id, false).orElseThrow(), now);
    }

    @Transactional
    public BulkOrderView decline(UUID chef, String chefToken, UUID id, String reason) {
        ownKitchen(chefToken, id); // asks Catalog before the row lock
        Row row = repository.find(id, true).orElseThrow(BulkOrderService::notFound);
        if (row.status() == BulkOrderStatus.ACCEPTED) {
            throw ApiProblem.conflict("BULK_ORDER_ACCEPTED", "An accepted bulk order is cancelled through its order");
        }
        Instant now = clock.instant();
        if (row.status() == BulkOrderStatus.REQUESTED || row.status() == BulkOrderStatus.QUOTED) {
            repository.setStatus(id, BulkOrderStatus.DECLINED, reason.strip(), now);
            audit.record(BulkOrdersModule.ID, chef, "DECLINED", "bulk_order", id, Map.of("reason", reason.strip()));
        }
        return view(repository.find(id, false).orElseThrow(), now);
    }

    @Override
    public String moduleId() {
        return BulkOrdersModule.ID;
    }

    @Override
    public Map<String, Object> export(UUID person) {
        Instant now = clock.instant();
        return Map.of("requests", repository.ofCustomer(person, Integer.MAX_VALUE).stream().map(row -> view(row, now)).toList());
    }

    @Override
    public int erase(UUID person) {
        return repository.erase(person, ERASED, clock.instant());
    }

    private Row own(UUID customer, UUID id, boolean forUpdate) {
        // Another person's request answers like a missing one, so request ids reveal nothing.
        return repository.find(id, forUpdate).filter(row -> row.customerId().equals(customer)).orElseThrow(BulkOrderService::notFound);
    }

    /** Another kitchen's request answers like a missing one, so request ids reveal nothing to other chefs either. */
    private void ownKitchen(String chefToken, UUID id) {
        Row row = repository.find(id, false).orElseThrow(BulkOrderService::notFound);
        boolean mine = catalog.chefMenuItems(chefToken).values().stream().anyMatch(item -> row.kitchenId().equals(item.kitchenId()));
        if (!mine) throw notFound();
    }

    private static ApiProblem notFound() {
        return ApiProblem.notFound("BULK_ORDER_NOT_FOUND", "No such bulk order request");
    }

    private static BulkOrderView view(Row row, Instant now) {
        int portions = row.lines().stream().mapToInt(BulkOrderLine::quantity).sum();
        return new BulkOrderView(row.id(), row.kitchenId(), row.eventAt(), row.guests(), row.notes(), portions, row.lines(), row.status(),
                BulkOrderRules.expired(row.status(), row.eventAt(), row.quoteValidUntil(), now), row.totalPaise(), row.depositPaise(),
                row.depositPercent(), row.quoteValidUntil(), row.quoteNote(), row.declineReason(), row.version(), row.createdAt());
    }

    private static ApiProblem versionMismatch() {
        return new ApiProblem(412, "VERSION_MISMATCH", "This request changed since you loaded it; reload and try again");
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
