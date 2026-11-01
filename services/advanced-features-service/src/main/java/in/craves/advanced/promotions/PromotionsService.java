package in.craves.advanced.promotions;

import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.promotions.PromotionsDtos.AdminPromotion;
import in.craves.advanced.promotions.PromotionsDtos.NewPromotion;
import in.craves.advanced.promotions.PromotionsDtos.PromotionCartItem;
import in.craves.advanced.promotions.PromotionsDtos.PromotionCartRequest;
import in.craves.advanced.promotions.PromotionsDtos.PromotionChange;
import in.craves.advanced.promotions.PromotionsDtos.PromotionOffer;
import in.craves.advanced.promotions.PromotionsDtos.PromotionQuote;
import in.craves.advanced.promotions.PromotionsDtos.PromotionRedemption;
import in.craves.advanced.promotions.PromotionsDtos.PromotionRedemptionPage;
import in.craves.advanced.promotions.PromotionsDtos.PromotionStatus;
import in.craves.advanced.promotions.PromotionsDtos.RedemptionStatus;
import in.craves.advanced.promotions.PromotionsRepository.Committed;
import in.craves.advanced.promotions.PromotionsRepository.Promotion;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PromotionsService implements PersonalDataContributor {
    static final UUID ERASED = new UUID(0, 0);
    /** Reservations keep counting this long after they expire, so replicas whose clocks differ slightly never overspend a budget. */
    static final Duration EXPIRY_GRACE = Duration.ofSeconds(30);
    private final PromotionsRepository repository;
    private final CatalogGateway catalog;
    private final Audit audit;
    private final Clock clock;
    private final Duration reservationTtl;

    /** The cart at live Catalog prices, per kitchen (a dish Catalog names no kitchen for counts only towards all-kitchen promotions). */
    record Cart(Map<UUID, Long> byKitchen, long subtotal) {
        long eligible(List<UUID> kitchenIds) {
            return kitchenIds.isEmpty() ? subtotal : kitchenIds.stream().mapToLong(id -> byKitchen.getOrDefault(id, 0L)).sum();
        }
    }

    private record Choice(Promotion promotion, long eligible, long discount) { }

    public PromotionsService(PromotionsRepository repository, CatalogGateway catalog, Audit audit, Clock clock,
                             @Value("${CRAVES_ADV_PROMO_RESERVATION_MINUTES:10}") String reservationMinutes) {
        this.repository = repository;
        this.catalog = catalog;
        this.audit = audit;
        this.clock = clock;
        this.reservationTtl = Duration.ofMinutes(PromotionRules.reservationMinutes(reservationMinutes));
    }

    /** Listed offers live right now with budget left, for one kitchen (with the all-kitchen ones) or for every kitchen. */
    @Transactional(readOnly = true)
    public List<PromotionOffer> offers(UUID kitchenId) {
        Instant now = clock.instant();
        List<Promotion> live = repository.live(now).stream().filter(p -> p.terms().listed())
                .filter(p -> kitchenId == null || p.terms().kitchenIds().isEmpty() || p.terms().kitchenIds().contains(kitchenId)).toList();
        Map<UUID, Committed> used = repository.committed(ids(live), counted(now));
        return live.stream().filter(p -> hasRoom(p.terms(), used.getOrDefault(p.id(), Committed.NONE))).map(PromotionsService::offer).toList();
    }

    /** The discount this cart gets: with the code, or else the best offer that applies by itself. Stores nothing. */
    @Transactional(readOnly = true)
    public PromotionQuote quote(UUID person, PromotionCartRequest request) {
        Cart cart = price(request.items());
        Instant now = clock.instant();
        String code = PromotionRules.code(request.code());
        if (code != null) {
            Promotion promotion = byCode(code);
            long discount = check(promotion, person, cart, now);
            return new PromotionQuote(cart.subtotal(), cart.eligible(promotion.terms().kitchenIds()), discount, offer(promotion));
        }
        return best(person, cart, now).map(choice -> new PromotionQuote(cart.subtotal(), choice.eligible(), choice.discount(), offer(choice.promotion())))
                .orElse(new PromotionQuote(cart.subtotal(), 0, 0, null));
    }

    /** Reserves the discount for this person's checkout; budget, caps and the per-person limit are checked and taken under one lock. */
    @Transactional
    public PromotionRedemption reserve(UUID person, PromotionCartRequest request) {
        Cart cart = price(request.items()); // asks Catalog before any row lock
        Instant now = clock.instant();
        String code = PromotionRules.code(request.code());
        UUID promotionId = code != null ? byCode(code).id()
                : best(person, cart, now).orElseThrow(() -> ApiProblem.unprocessable("NO_OFFER_APPLIES", "No offer applies to this cart"))
                .promotion().id();
        Promotion promotion = repository.promotion(promotionId, true).orElseThrow();
        Optional<PromotionRedemption> existing = repository.liveReservation(promotionId, person, now);
        if (existing.isPresent()) {
            throw new ApiProblem(409, "PROMO_RESERVATION_EXISTS", "You already reserved this offer", List.of(existing.get().id().toString()));
        }
        long discount = check(promotion, person, cart, now);
        PromotionRedemption redemption = new PromotionRedemption(UUID.randomUUID(), promotionId, person, discount, cart.subtotal(),
                cart.eligible(promotion.terms().kitchenIds()), RedemptionStatus.RESERVED, null, now.plus(reservationTtl), now);
        repository.insertRedemption(redemption, now);
        return repository.redemption(redemption.id(), false).orElseThrow();
    }

    /** Confirms a live reservation with the order it became. Repeating it with the same order is harmless. */
    @Transactional
    public PromotionRedemption confirm(UUID person, UUID redemptionId, UUID orderId) {
        PromotionRedemption found = own(person, redemptionId, false);
        repository.promotion(found.promotionId(), true); // same lock order as reserve()
        PromotionRedemption redemption = own(person, redemptionId, true);
        if (redemption.status() == RedemptionStatus.CONFIRMED) {
            if (orderId.equals(redemption.orderId())) return redemption;
            throw ApiProblem.conflict("REDEMPTION_CONFIRMED", "This offer is already used for another order");
        }
        if (redemption.status() != RedemptionStatus.RESERVED) throw ApiProblem.conflict("REDEMPTION_RELEASED", "This reservation was released");
        Instant now = clock.instant();
        if (!now.isBefore(redemption.expiresAt())) throw ApiProblem.conflict("REDEMPTION_EXPIRED", "This reservation expired; reserve the offer again");
        try {
            repository.setRedemption(redemptionId, RedemptionStatus.CONFIRMED, orderId, now);
        } catch (DuplicateKeyException stacked) {
            throw ApiProblem.conflict("ORDER_HAS_PROMOTION", "This order already uses another offer");
        }
        return repository.redemption(redemptionId, false).orElseThrow();
    }

    @Transactional
    public void release(UUID person, UUID redemptionId) {
        PromotionRedemption redemption = own(person, redemptionId, true);
        if (redemption.status() == RedemptionStatus.CONFIRMED) {
            throw ApiProblem.conflict("REDEMPTION_CONFIRMED", "A used offer is given back by cancelling the order");
        }
        if (redemption.status() == RedemptionStatus.RESERVED) {
            repository.setRedemption(redemptionId, RedemptionStatus.RELEASED, null, clock.instant());
        }
    }

    @Transactional(readOnly = true)
    public List<AdminPromotion> adminPromotions() {
        List<Promotion> all = repository.promotions();
        Map<UUID, Committed> used = repository.committed(ids(all), counted(clock.instant()));
        return all.stream().map(p -> admin(p, used.getOrDefault(p.id(), Committed.NONE))).toList();
    }

    /** New promotions start as DRAFT; staff make them live with an update. */
    @Transactional
    public AdminPromotion createPromotion(UUID staff, NewPromotion request) {
        NewPromotion terms = valid(request, List.of());
        UUID id = UUID.randomUUID();
        try {
            repository.insertPromotion(id, terms, staff, clock.instant());
        } catch (DuplicateKeyException taken) {
            throw codeInUse();
        }
        audit.record(PromotionsModule.ID, staff, "PROMOTION_CREATED", "promotion", id, Map.of("promotion", terms));
        return admin(repository.promotion(id, false).orElseThrow(), Committed.NONE);
    }

    @Transactional
    public AdminPromotion updatePromotion(UUID staff, UUID id, PromotionChange change) {
        Promotion named = repository.promotion(id, false).orElseThrow(() -> ApiProblem.notFound("PROMOTION_NOT_FOUND", "No such promotion"));
        // Catalog is asked (before the row lock) only about kitchens the promotion does not name yet, so a kitchen that has since
        // closed, or a Catalog outage, never stops staff from pausing or ending a promotion.
        NewPromotion terms = valid(change.promotion(), named.terms().kitchenIds());
        Promotion current = repository.promotion(id, true).orElseThrow();
        if (change.expectedVersion() != current.version()) {
            throw new ApiProblem(412, "VERSION_MISMATCH", "This promotion changed since you loaded it; reload and try again");
        }
        if (current.status() == PromotionStatus.ENDED) throw ApiProblem.conflict("PROMOTION_ENDED", "An ended promotion cannot change; create a new one");
        if (!PromotionRules.statusChangeAllowed(current.status(), change.status())) {
            throw new ApiProblem(409, "INVALID_STATUS_CHANGE", "This status change is not possible", List.of(current.status() + " -> " + change.status()));
        }
        if (current.activatedAt() != null) {
            List<String> frozen = PromotionRules.frozenChanges(current.terms(), terms);
            if (!frozen.isEmpty()) {
                throw new ApiProblem(409, "TERMS_FROZEN", "This promotion has been live, so its terms cannot change; end it and create a new one", frozen);
            }
        }
        Instant now = clock.instant();
        if (change.status() == PromotionStatus.ACTIVE && !now.isBefore(terms.endsAt())) {
            throw ApiProblem.unprocessable("PROMOTION_WINDOW_OVER", "The end time has passed");
        }
        Committed used = repository.committed(List.of(id), counted(now)).getOrDefault(id, Committed.NONE);
        if (!hasRoomFor(terms, used)) {
            throw new ApiProblem(409, "BELOW_COMMITTED", "More is already reserved or used than this allows",
                    List.of("committedPaise: " + used.paise(), "redemptions: " + used.count()));
        }
        Instant activatedAt = current.activatedAt() != null ? current.activatedAt() : change.status() == PromotionStatus.ACTIVE ? now : null;
        try {
            repository.updatePromotion(id, terms, change.status(), activatedAt, staff, now);
        } catch (DuplicateKeyException taken) {
            throw codeInUse();
        }
        String action = current.status() == change.status() ? "PROMOTION_UPDATED" : "PROMOTION_" + change.status().name();
        audit.record(PromotionsModule.ID, staff, action, "promotion", id, Map.of("promotion", terms, "version", current.version() + 1));
        return admin(repository.promotion(id, false).orElseThrow(), used);
    }

    @Transactional(readOnly = true)
    public PromotionRedemptionPage redemptions(UUID promotionId, String cursor, int limit) {
        repository.promotion(promotionId, false).orElseThrow(() -> ApiProblem.notFound("PROMOTION_NOT_FOUND", "No such promotion"));
        List<PromotionRedemption> rows = repository.redemptionsOfPromotion(promotionId, Cursor.decode(cursor), limit + 1);
        if (rows.size() <= limit) return new PromotionRedemptionPage(rows, null);
        PromotionRedemption last = rows.get(limit - 1);
        return new PromotionRedemptionPage(rows.subList(0, limit), new Cursor(last.createdAt(), last.id()).encode());
    }

    /** Staff give a reserved or used discount back to the budget (for example a confirmation no real order backs). Audited with the reason. */
    @Transactional
    public PromotionRedemption voidRedemption(UUID staff, UUID redemptionId, String reason) {
        PromotionRedemption found = repository.redemption(redemptionId, false)
                .orElseThrow(() -> ApiProblem.notFound("REDEMPTION_NOT_FOUND", "No such redemption"));
        repository.promotion(found.promotionId(), true); // same lock order as reserve() and confirm()
        PromotionRedemption redemption = repository.redemption(redemptionId, true)
                .orElseThrow(() -> ApiProblem.notFound("REDEMPTION_NOT_FOUND", "No such redemption"));
        if (redemption.status() == RedemptionStatus.RESERVED || redemption.status() == RedemptionStatus.CONFIRMED) {
            repository.setRedemption(redemptionId, RedemptionStatus.VOIDED, redemption.orderId(), clock.instant());
            audit.record(PromotionsModule.ID, staff, "REDEMPTION_VOIDED", "redemption", redemptionId, Map.of("promotionId", redemption.promotionId(),
                    "status", redemption.status().name(), "discountPaise", redemption.discountPaise(), "reason", reason.strip()));
        }
        return repository.redemption(redemptionId, false).orElseThrow();
    }

    @Override
    public String moduleId() {
        return PromotionsModule.ID;
    }

    @Override
    public Map<String, Object> export(UUID person) {
        return Map.of("redemptions", repository.redemptionsOfPerson(person));
    }

    @Override
    public int erase(UUID person) {
        Instant now = clock.instant();
        return repository.erase(person, ERASED, counted(now), now);
    }

    /** The discount, or the reason the promotion does not apply, with fresh counts. */
    private long check(Promotion promotion, UUID person, Cart cart, Instant now) {
        Committed used = repository.committed(List.of(promotion.id()), counted(now)).getOrDefault(promotion.id(), Committed.NONE);
        int mine = repository.personCounts(person, List.of(promotion.id()), counted(now)).getOrDefault(promotion.id(), 0);
        long eligible = cart.eligible(promotion.terms().kitchenIds());
        long discount = PromotionRules.discount(promotion.terms(), eligible);
        String refusal = PromotionRules.refusal(promotion.status(), promotion.terms(), eligible, discount, used.count(), used.paise(), mine, now);
        if (refusal != null) throw refused(refusal, promotion.terms());
        return discount;
    }

    /** The largest discount among offers without a code; live() lists them ending soonest first, which wins a tie. */
    private Optional<Choice> best(UUID person, Cart cart, Instant now) {
        List<Promotion> automatic = repository.live(now).stream().filter(p -> p.terms().code() == null).toList();
        Map<UUID, Committed> used = repository.committed(ids(automatic), counted(now));
        Map<UUID, Integer> mine = repository.personCounts(person, ids(automatic), counted(now));
        Choice best = null;
        for (Promotion promotion : automatic) {
            long eligible = cart.eligible(promotion.terms().kitchenIds());
            long discount = PromotionRules.discount(promotion.terms(), eligible);
            Committed counts = used.getOrDefault(promotion.id(), Committed.NONE);
            String refusal = PromotionRules.refusal(promotion.status(), promotion.terms(), eligible, discount, counts.count(), counts.paise(),
                    mine.getOrDefault(promotion.id(), 0), now);
            if (refusal == null && (best == null || discount > best.discount())) best = new Choice(promotion, eligible, discount);
        }
        return Optional.ofNullable(best);
    }

    private Cart price(List<PromotionCartItem> items) {
        Map<UUID, Integer> quantities = new LinkedHashMap<>();
        items.forEach(item -> quantities.merge(item.menuItemId(), item.quantity(), Integer::sum));
        Map<UUID, MenuItem> live = catalog.purchasable(quantities.keySet());
        List<String> unavailable = quantities.keySet().stream().filter(id -> live.get(id) == null || live.get(id).pricePaise() == null)
                .map(UUID::toString).toList();
        if (!unavailable.isEmpty()) throw new ApiProblem(409, "ITEMS_UNAVAILABLE", "Some dishes cannot be bought right now", unavailable);
        Map<UUID, Long> byKitchen = new HashMap<>();
        long subtotal = 0;
        for (Map.Entry<UUID, Integer> line : quantities.entrySet()) {
            MenuItem item = live.get(line.getKey());
            long amount = Math.multiplyExact(item.pricePaise().longValue(), line.getValue().longValue());
            byKitchen.merge(item.kitchenId(), amount, Math::addExact);
            subtotal = Math.addExact(subtotal, amount);
        }
        return new Cart(byKitchen, subtotal);
    }

    private NewPromotion valid(NewPromotion request, List<UUID> alreadyNamed) {
        NewPromotion terms = PromotionRules.normalise(request);
        List<String> problems = PromotionRules.invalid(terms);
        if (!problems.isEmpty()) throw new ApiProblem(400, "INVALID_PROMOTION", "The promotion's terms do not fit together", problems);
        List<String> unknown = terms.kitchenIds().stream().filter(id -> !alreadyNamed.contains(id)).filter(id -> !catalog.kitchenExists(id))
                .map(UUID::toString).toList();
        if (!unknown.isEmpty()) throw new ApiProblem(400, "UNKNOWN_KITCHEN", "Catalog does not know these kitchens", unknown);
        return terms;
    }

    private PromotionRedemption own(UUID person, UUID redemptionId, boolean forUpdate) {
        // Another person's redemption answers like a missing one, so redemption ids reveal nothing.
        return repository.redemption(redemptionId, forUpdate).filter(redemption -> redemption.personId().equals(person))
                .orElseThrow(() -> ApiProblem.notFound("REDEMPTION_NOT_FOUND", "No such redemption"));
    }

    private static boolean hasRoom(NewPromotion terms, Committed used) {
        return used.paise() < terms.totalBudgetPaise() && (terms.maxRedemptions() == null || used.count() < terms.maxRedemptions());
    }

    private static boolean hasRoomFor(NewPromotion terms, Committed used) {
        return used.paise() <= terms.totalBudgetPaise() && (terms.maxRedemptions() == null || used.count() <= terms.maxRedemptions());
    }

    private static ApiProblem refused(String code, NewPromotion terms) {
        return switch (code) {
            case "PROMO_ENDED" -> ApiProblem.unprocessable(code, "This offer has ended");
            case "PROMO_NOT_ACTIVE" -> ApiProblem.unprocessable(code, "This offer is not active right now");
            case "PROMO_NOT_FOR_THESE_DISHES" -> ApiProblem.unprocessable(code, "This offer is for other kitchens");
            case "PROMO_MIN_ORDER" -> new ApiProblem(422, code, "Add more to your cart to use this offer", List.of("minOrderPaise: " + terms.minOrderPaise()));
            case "PROMO_PERSON_LIMIT" -> ApiProblem.conflict(code, "You have already used this offer");
            default -> ApiProblem.conflict(code, "This offer has run out");
        };
    }

    /** A draft's code answers like an unknown one, so codes cannot be discovered before launch. */
    private Promotion byCode(String code) {
        return repository.promotionByCode(code).filter(promotion -> promotion.status() != PromotionStatus.DRAFT)
                .orElseThrow(() -> ApiProblem.notFound("PROMO_CODE_UNKNOWN", "This code is not valid"));
    }

    private static ApiProblem codeInUse() {
        return ApiProblem.conflict("CODE_IN_USE", "Another promotion already uses this code");
    }

    private static PromotionOffer offer(Promotion promotion) {
        NewPromotion t = promotion.terms();
        return new PromotionOffer(promotion.id(), t.title(), t.description(), t.code(), t.discountKind(), t.percentOff(), t.flatPaise(),
                t.maxDiscountPaise(), t.minOrderPaise(), t.kitchenIds(), t.endsAt());
    }

    private static AdminPromotion admin(Promotion promotion, Committed used) {
        return new AdminPromotion(promotion.id(), promotion.terms(), promotion.status(), promotion.activatedAt(), promotion.version(),
                promotion.updatedAt(), used.reserved(), used.confirmed(), used.paise());
    }

    private static List<UUID> ids(List<Promotion> promotions) {
        return promotions.stream().map(Promotion::id).toList();
    }

    private static Instant counted(Instant now) {
        return now.minus(EXPIRY_GRACE);
    }
}
