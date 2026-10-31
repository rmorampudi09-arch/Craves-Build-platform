package in.craves.advanced.kitchencapacity;

import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.BatchAvailability;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.BatchChange;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.BatchStatus;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.ChefBatch;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.HoldStatus;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.KitchenLoad;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.KitchenLoadRequest;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.NewBatch;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.PortionHold;
import in.craves.advanced.kitchencapacity.KitchenCapacityRepository.Batch;
import in.craves.advanced.kitchencapacity.KitchenCapacityRepository.Hold;
import in.craves.advanced.kitchencapacity.KitchenCapacityRepository.Taken;
import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class KitchenCapacityService implements PersonalDataContributor {
    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    static final UUID ERASED = new UUID(0, 0);
    static final int MAX_DAYS_AHEAD = 30;
    static final int MAX_PORTIONS_PER_PERSON = 50;
    /** Held portions keep counting this long after their hold expires, so replicas whose clocks differ slightly never sell them twice. */
    static final Duration EXPIRY_GRACE = Duration.ofSeconds(30);
    private final KitchenCapacityRepository repository;
    private final CatalogGateway catalog;
    private final Audit audit;
    private final Clock clock;
    private final Duration holdTtl;

    public KitchenCapacityService(KitchenCapacityRepository repository, CatalogGateway catalog, Audit audit, Clock clock,
                                  @Value("${CRAVES_ADV_BATCH_HOLD_MINUTES:10}") String holdMinutes) {
        this.repository = repository;
        this.catalog = catalog;
        this.audit = audit;
        this.clock = clock;
        this.holdTtl = Duration.ofMinutes(holdMinutes(holdMinutes));
    }

    /** Kept between 1 and 60; anything unreadable means 10, because a bad setting must not stop the other modules from starting. */
    static int holdMinutes(String setting) {
        try {
            return Math.max(1, Math.min(60, Integer.parseInt(setting.strip())));
        } catch (RuntimeException unreadable) {
            return 10;
        }
    }

    /** Holds are taken only while the batch is open, before its cutoff and before its India service date is over. */
    static boolean acceptsHolds(String status, Instant orderCutoff, LocalDate serviceDate, Instant now) {
        return BatchStatus.OPEN.name().equals(status) && (orderCutoff == null || now.isBefore(orderCutoff))
                && now.isBefore(serviceDate.plusDays(1).atStartOfDay(INDIA).toInstant());
    }

    static boolean serviceDateAllowed(LocalDate date, LocalDate today) {
        return !date.isBefore(today) && !date.isAfter(today.plusDays(MAX_DAYS_AHEAD));
    }

    @Transactional(readOnly = true)
    public List<BatchAvailability> dishBatches(UUID menuItemId, LocalDate date) {
        Instant now = clock.instant();
        List<Batch> batches = repository.batchesForItem(menuItemId, date == null ? today() : date);
        Map<UUID, Taken> taken = repository.taken(batches.stream().map(Batch::id).toList(), counted(now));
        return batches.stream().map(batch -> {
            int remaining = Math.max(0, remaining(batch, taken.getOrDefault(batch.id(), Taken.NONE)));
            return new BatchAvailability(batch.id(), batch.menuItemId(), batch.serviceDate(), batch.portions(), remaining, batch.orderCutoff(),
                    batch.readyAt(), remaining > 0 && acceptsHolds(batch.status(), batch.orderCutoff(), batch.serviceDate(), now));
        }).toList();
    }

    @Transactional(readOnly = true)
    public List<ChefBatch> chefBatches(String chefToken, LocalDate date) {
        Optional<UUID> kitchen = kitchenOf(chefToken);
        if (kitchen.isEmpty()) return List.of();
        List<Batch> batches = repository.batchesForKitchen(kitchen.get(), date == null ? today() : date);
        Map<UUID, Taken> taken = repository.taken(batches.stream().map(Batch::id).toList(), counted(clock.instant()));
        return batches.stream().map(batch -> chefView(batch, taken.getOrDefault(batch.id(), Taken.NONE))).toList();
    }

    @Transactional
    public ChefBatch createBatch(UUID chef, String chefToken, NewBatch request) {
        MenuItem item = catalog.chefMenuItems(chefToken).get(request.menuItemId());
        if (item == null) throw ApiProblem.forbidden("NOT_YOUR_MENU_ITEM", "This dish is not on your menu");
        if (item.kitchenId() == null) throw ApiProblem.conflict("KITCHEN_UNKNOWN", "Catalog did not name this dish's kitchen; try again");
        Instant now = clock.instant();
        if (!serviceDateAllowed(request.serviceDate(), today())) {
            throw ApiProblem.badRequest("INVALID_SERVICE_DATE", "Batches are for today or up to " + MAX_DAYS_AHEAD + " days ahead (India date)");
        }
        if (request.orderCutoff() != null && !request.orderCutoff().isAfter(now)) {
            throw ApiProblem.badRequest("INVALID_CUTOFF", "The order cutoff must be in the future");
        }
        Batch batch = new Batch(UUID.randomUUID(), item.id(), item.kitchenId(), chef, request.serviceDate(), request.portions(),
                request.orderCutoff(), request.readyAt(), BatchStatus.OPEN.name(), 1);
        repository.insertBatch(batch, now);
        audit.record(KitchenCapacityModule.ID, chef, "BATCH_CREATED", "batch", batch.id(),
                Map.of("menuItemId", item.id(), "serviceDate", request.serviceDate().toString(), "portions", request.portions()));
        return chefView(batch, Taken.NONE);
    }

    @Transactional
    public ChefBatch updateBatch(UUID chef, String chefToken, UUID batchId, BatchChange change) {
        ownBatch(chef, chefToken, batchId); // asks Catalog before the row lock, so a slow Catalog never holds up holds
        Batch batch = repository.batch(batchId, true).orElseThrow();
        if (change.expectedVersion() != batch.version()) {
            throw new ApiProblem(412, "VERSION_MISMATCH", "This batch changed since you loaded it; reload and try again");
        }
        Instant now = clock.instant();
        Taken taken = repository.taken(List.of(batchId), counted(now)).getOrDefault(batchId, Taken.NONE);
        if (change.portions() < taken.held() + taken.confirmed()) {
            throw new ApiProblem(409, "PORTIONS_BELOW_TAKEN", "More portions are already held or confirmed",
                    List.of("taken: " + (taken.held() + taken.confirmed())));
        }
        repository.updateBatch(batchId, change.portions(), change.orderCutoff(), change.readyAt(), change.status().name(), now);
        audit.record(KitchenCapacityModule.ID, chef, "BATCH_UPDATED", "batch", batchId,
                Map.of("portions", change.portions(), "status", change.status().name()));
        Batch saved = repository.batch(batchId, false).orElseThrow();
        return chefView(saved, taken);
    }

    /** Holds portions for the signed-in person while they check out: one live hold per person per batch, and at most 50 portions each. */
    @Transactional
    public PortionHold hold(UUID person, UUID batchId, int portions) {
        Batch batch = repository.batch(batchId, true).orElseThrow(() -> ApiProblem.notFound("BATCH_NOT_FOUND", "No such batch"));
        Instant now = clock.instant();
        if (!acceptsHolds(batch.status(), batch.orderCutoff(), batch.serviceDate(), now)) {
            throw ApiProblem.conflict("BATCH_CLOSED", "This batch takes no more orders");
        }
        Optional<Hold> existing = repository.activeHold(batchId, person, now);
        if (existing.isPresent()) {
            throw new ApiProblem(409, "HOLD_EXISTS", "You already hold portions of this batch", List.of(existing.get().id().toString()));
        }
        int mine = repository.personTaken(batchId, person, counted(now));
        if (mine + portions > MAX_PORTIONS_PER_PERSON) {
            throw new ApiProblem(409, "PERSON_LIMIT", "One person can hold or buy at most " + MAX_PORTIONS_PER_PERSON + " portions of a batch",
                    List.of("yours: " + mine));
        }
        int remaining = remaining(batch, repository.taken(List.of(batchId), counted(now)).getOrDefault(batchId, Taken.NONE));
        if (portions > remaining) throw new ApiProblem(409, "SOLD_OUT", "Not enough portions left", List.of("remaining: " + Math.max(0, remaining)));
        Hold hold = new Hold(UUID.randomUUID(), batchId, person, portions, HoldStatus.HELD.name(), null, now.plus(holdTtl));
        repository.insertHold(hold, now);
        return view(hold);
    }

    /** Confirms a live hold with the order it became. Repeating it with the same order is harmless. */
    @Transactional
    public PortionHold confirm(UUID person, UUID holdId, UUID orderId) {
        Hold found = ownHold(person, holdId, false);
        repository.batch(found.batchId(), true); // same lock order as hold(): no portion is ever counted twice
        Hold hold = repository.hold(holdId, true).orElseThrow();
        if (HoldStatus.CONFIRMED.name().equals(hold.status())) {
            if (orderId.equals(hold.orderId())) return view(hold);
            throw ApiProblem.conflict("HOLD_CONFIRMED", "This hold is already confirmed for another order");
        }
        if (HoldStatus.RELEASED.name().equals(hold.status())) throw ApiProblem.conflict("HOLD_RELEASED", "This hold was released");
        Instant now = clock.instant();
        if (!now.isBefore(hold.expiresAt())) throw ApiProblem.conflict("HOLD_EXPIRED", "This hold expired; hold the portions again");
        repository.setHold(holdId, HoldStatus.CONFIRMED.name(), orderId, now);
        return view(repository.hold(holdId, false).orElseThrow());
    }

    @Transactional
    public void release(UUID person, UUID holdId) {
        Hold hold = ownHold(person, holdId, true);
        if (HoldStatus.CONFIRMED.name().equals(hold.status())) {
            throw ApiProblem.conflict("HOLD_CONFIRMED", "Confirmed portions are released by cancelling the order");
        }
        if (HoldStatus.HELD.name().equals(hold.status())) repository.setHold(holdId, HoldStatus.RELEASED.name(), null, clock.instant());
    }

    /** The batch's live and confirmed holds, without who holds them, so the chef can void any that no real order backs. */
    @Transactional(readOnly = true)
    public List<PortionHold> chefHolds(UUID chef, String chefToken, UUID batchId) {
        ownBatch(chef, chefToken, batchId);
        return repository.holdsOfBatch(batchId, counted(clock.instant())).stream().map(KitchenCapacityService::view).toList();
    }

    /** The chef gives held or confirmed portions back to the batch (for example a confirmation with no real order). Audited with the reason. */
    @Transactional
    public PortionHold voidHold(UUID chef, String chefToken, UUID holdId, String reason) {
        Hold found = repository.hold(holdId, false).orElseThrow(() -> ApiProblem.notFound("HOLD_NOT_FOUND", "No such hold"));
        ownBatch(chef, chefToken, found.batchId());
        repository.batch(found.batchId(), true); // same lock order as hold() and confirm()
        Hold hold = repository.hold(holdId, true).orElseThrow();
        if (!HoldStatus.RELEASED.name().equals(hold.status())) {
            repository.setHold(holdId, HoldStatus.RELEASED.name(), null, clock.instant());
            audit.record(KitchenCapacityModule.ID, chef, "HOLD_VOIDED", "hold", holdId,
                    Map.of("batchId", hold.batchId(), "status", hold.status(), "portions", hold.portions(), "reason", reason.strip()));
        }
        return view(repository.hold(holdId, false).orElseThrow());
    }

    @Transactional(readOnly = true)
    public KitchenLoad kitchenLoad(UUID kitchenId) {
        Instant now = clock.instant();
        return repository.load(kitchenId).filter(load -> load.extraPrepMinutes() > 0 && load.until().isAfter(now))
                .orElse(new KitchenLoad(kitchenId, 0, null));
    }

    /** The chef's own "we are busy" extra preparation time, shown on top of each dish's usual preparation time. */
    @Transactional
    public KitchenLoad setKitchenLoad(UUID chef, String chefToken, KitchenLoadRequest request) {
        UUID kitchen = kitchenOf(chefToken)
                .orElseThrow(() -> ApiProblem.conflict("KITCHEN_HAS_NO_DISHES", "Add a dish to your menu before setting extra preparation time"));
        Instant now = clock.instant();
        if (!request.until().isAfter(now) || request.until().isAfter(now.plus(Duration.ofHours(24)))) {
            throw ApiProblem.badRequest("INVALID_UNTIL", "until must be within the next 24 hours");
        }
        repository.saveLoad(kitchen, chef, request.extraPrepMinutes(), request.until(), now);
        audit.record(KitchenCapacityModule.ID, chef, "KITCHEN_LOAD_SET", "kitchen", kitchen,
                Map.of("extraPrepMinutes", request.extraPrepMinutes(), "until", request.until().toString()));
        return kitchenLoad(kitchen);
    }

    @Override
    public String moduleId() {
        return KitchenCapacityModule.ID;
    }

    @Override
    public Map<String, Object> export(UUID person) {
        return Map.of("holds", repository.holdsOf(person).stream().map(KitchenCapacityService::view).toList());
    }

    @Override
    public int erase(UUID person) {
        return repository.eraseHolds(person, ERASED, clock.instant());
    }

    private Hold ownHold(UUID person, UUID holdId, boolean forUpdate) {
        // Another person's hold answers like a missing one, so hold ids reveal nothing.
        return repository.hold(holdId, forUpdate).filter(hold -> hold.personId().equals(person))
                .orElseThrow(() -> ApiProblem.notFound("HOLD_NOT_FOUND", "No such hold"));
    }

    private Batch ownBatch(UUID chef, String chefToken, UUID batchId) {
        Batch batch = repository.batch(batchId, false).orElseThrow(() -> ApiProblem.notFound("BATCH_NOT_FOUND", "No such batch"));
        if (!batch.chefId().equals(chef) || !catalog.chefMenuItems(chefToken).containsKey(batch.menuItemId())) {
            throw ApiProblem.forbidden("NOT_YOUR_BATCH", "This batch belongs to another chef");
        }
        return batch;
    }

    private static Instant counted(Instant now) {
        return now.minus(EXPIRY_GRACE);
    }

    private Optional<UUID> kitchenOf(String chefToken) {
        return catalog.chefMenuItems(chefToken).values().stream().map(MenuItem::kitchenId).filter(Objects::nonNull).findFirst();
    }

    private LocalDate today() {
        return clock.instant().atZone(INDIA).toLocalDate();
    }

    private static int remaining(Batch batch, Taken taken) {
        return batch.portions() - taken.held() - taken.confirmed();
    }

    private static ChefBatch chefView(Batch batch, Taken taken) {
        return new ChefBatch(batch.id(), batch.menuItemId(), batch.serviceDate(), batch.portions(), taken.held(), taken.confirmed(),
                Math.max(0, remaining(batch, taken)), batch.orderCutoff(), batch.readyAt(), BatchStatus.valueOf(batch.status()), batch.version());
    }

    private static PortionHold view(Hold hold) {
        return new PortionHold(hold.id(), hold.batchId(), hold.portions(), HoldStatus.valueOf(hold.status()), hold.orderId(), hold.expiresAt());
    }
}
