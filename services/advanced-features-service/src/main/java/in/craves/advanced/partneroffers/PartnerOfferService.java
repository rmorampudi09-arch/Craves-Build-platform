package in.craves.advanced.partneroffers;

import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferAdminView;
import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferCard;
import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferClaimView;
import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferDraft;
import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferStatus;
import in.craves.advanced.platform.clients.OrderGateway;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.Clock;
import java.time.Instant;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class PartnerOfferService implements PersonalDataContributor {
    private final PartnerOfferRepository repository;
    private final OrderGateway orders;
    private final Audit audit;
    private final Clock clock;
    private final TransactionTemplate tx;

    public PartnerOfferService(PartnerOfferRepository repository, OrderGateway orders, Audit audit, Clock clock,
                               PlatformTransactionManager transactions) {
        this.repository = repository;
        this.orders = orders;
        this.audit = audit;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactions);
    }

    @Transactional(readOnly = true)
    public List<PartnerOfferAdminView> list() {
        return repository.all();
    }

    @Transactional(readOnly = true)
    public PartnerOfferAdminView get(UUID id) {
        return find(id, false);
    }

    @Transactional
    public PartnerOfferAdminView create(UUID staff, PartnerOfferDraft draft) {
        PartnerOfferRules.check(draft, clock.instant());
        UUID id = UUID.randomUUID();
        repository.insert(id, draft, staff, clock.instant());
        audit.record(PartnerOffersModule.ID, staff, "PARTNER_OFFER_CREATED", "partner_offer", id, Map.of("partner", draft.partnerName().strip()));
        return get(id);
    }

    /** Only drafts change, so no customer is shown one thing and given another; end it and create a new offer instead. */
    @Transactional
    public PartnerOfferAdminView change(UUID staff, UUID id, PartnerOfferDraft draft) {
        if (draft.expectedVersion() == null) throw ApiProblem.badRequest("VERSION_REQUIRED", "Send the expectedVersion you loaded");
        PartnerOfferAdminView current = find(id, true);
        checkVersion(current, draft.expectedVersion());
        if (current.status() != PartnerOfferStatus.DRAFT) throw ApiProblem.conflict("OFFER_NOT_DRAFT", "Only a draft offer can change");
        PartnerOfferRules.check(draft, clock.instant());
        repository.update(id, draft, staff, clock.instant());
        audit.record(PartnerOffersModule.ID, staff, "PARTNER_OFFER_CHANGED", "partner_offer", id, Map.of());
        return get(id);
    }

    @Transactional
    public PartnerOfferAdminView activate(UUID staff, UUID id, long expectedVersion) {
        PartnerOfferAdminView current = find(id, true);
        if (!current.endsAt().isAfter(clock.instant())) throw ApiProblem.conflict("OFFER_OVER", "The offer's end time has passed");
        return transition(staff, current, expectedVersion, EnumSet.of(PartnerOfferStatus.DRAFT, PartnerOfferStatus.PAUSED), PartnerOfferStatus.ACTIVE);
    }

    @Transactional
    public PartnerOfferAdminView pause(UUID staff, UUID id, long expectedVersion) {
        return transition(staff, find(id, true), expectedVersion, EnumSet.of(PartnerOfferStatus.ACTIVE), PartnerOfferStatus.PAUSED);
    }

    @Transactional
    public PartnerOfferAdminView end(UUID staff, UUID id, long expectedVersion) {
        return transition(staff, find(id, true), expectedVersion,
                EnumSet.of(PartnerOfferStatus.DRAFT, PartnerOfferStatus.ACTIVE, PartnerOfferStatus.PAUSED), PartnerOfferStatus.ENDED);
    }

    /** The offers this order unlocks; an order that is unpaid, rejected, cancelled or refunded unlocks none. */
    /** Not transactional: Order service is asked before any database connection is taken (the pool is small and shared). */
    public List<PartnerOfferCard> forOrder(UUID person, String bearer, UUID orderId) {
        Order order = order(person, bearer, orderId);
        if (!PartnerOfferRules.unlocks(order.status())) return List.of();
        Set<UUID> claimed = repository.claimedOfferIds(person);
        return repository.liveFor(person, clock.instant()).stream().map(offer -> new PartnerOfferCard(offer.id(), offer.partnerName(), offer.title(),
                offer.description(), offer.terms(), offer.endsAt(), offer.code() != null, claimed.contains(offer.id()))).toList();
    }

    /** One claim per person and offer; claiming again returns the first claim. The limit is taken under the offer's row lock. */
    public PartnerOfferClaimView claim(UUID person, String bearer, UUID orderId, UUID offerId) {
        Order order = order(person, bearer, orderId);
        if (!PartnerOfferRules.unlocks(order.status())) {
            throw ApiProblem.conflict("ORDER_NOT_ELIGIBLE", "Only a paid order that was not rejected, cancelled or refunded unlocks partner offers");
        }
        return tx.execute(status -> claimInTransaction(person, orderId, offerId));
    }

    private PartnerOfferClaimView claimInTransaction(UUID person, UUID orderId, UUID offerId) {
        repository.lockPerson(person);
        var existing = repository.claim(person, offerId);
        if (existing.isPresent()) return existing.get();
        PartnerOfferAdminView offer = repository.one(offerId, true).filter(o -> o.status() != PartnerOfferStatus.DRAFT)
                .orElseThrow(() -> ApiProblem.notFound("OFFER_NOT_FOUND", "No such partner offer"));
        Instant now = clock.instant();
        if (offer.status() != PartnerOfferStatus.ACTIVE || now.isBefore(offer.startsAt()) || !now.isBefore(offer.endsAt())) {
            throw ApiProblem.conflict("OFFER_NOT_AVAILABLE", "This offer is not available right now");
        }
        if (offer.claimLimit() != null && offer.claimedCount() >= offer.claimLimit()) {
            throw ApiProblem.conflict("OFFER_SOLD_OUT", "This offer has been fully claimed");
        }
        repository.insertClaim(person, offerId, orderId, now);
        return repository.claim(person, offerId).orElseThrow();
    }

    @Transactional(readOnly = true)
    public List<PartnerOfferClaimView> mine(UUID person) {
        return repository.claimsOf(person);
    }

    @Override
    public String moduleId() {
        return PartnerOffersModule.ID;
    }

    @Override
    public Map<String, Object> export(UUID person) {
        Map<String, Object> export = new LinkedHashMap<>();
        export.put("claims", repository.claimsOf(person));
        return export;
    }

    /** The claims go; the offer's claimed count keeps them, so a limit is never reopened by an erase. */
    @Override
    public int erase(UUID person) {
        repository.lockPerson(person);
        return repository.deleteClaimsOf(person);
    }

    private Order order(UUID person, String bearer, UUID orderId) {
        return orders.customerOrder(bearer, orderId).filter(found -> person.equals(found.customerId())).orElseThrow(() -> ApiProblem.notFound("ORDER_NOT_FOUND", "No such order"));
    }

    private PartnerOfferAdminView transition(UUID staff, PartnerOfferAdminView current, long expectedVersion, Set<PartnerOfferStatus> from,
                                             PartnerOfferStatus to) {
        checkVersion(current, expectedVersion);
        if (!from.contains(current.status())) throw ApiProblem.conflict("OFFER_STATUS", "The offer is " + current.status());
        repository.status(current.id(), to, staff, clock.instant());
        audit.record(PartnerOffersModule.ID, staff, "PARTNER_OFFER_" + to.name(), "partner_offer", current.id(), Map.of("from", current.status().name()));
        return get(current.id());
    }

    private PartnerOfferAdminView find(UUID id, boolean forUpdate) {
        return repository.one(id, forUpdate).orElseThrow(() -> ApiProblem.notFound("OFFER_NOT_FOUND", "No such partner offer"));
    }

    private static void checkVersion(PartnerOfferAdminView current, long expected) {
        if (current.version() != expected) throw new ApiProblem(412, "VERSION_MISMATCH", "This changed since you loaded it; reload and try again");
    }
}
