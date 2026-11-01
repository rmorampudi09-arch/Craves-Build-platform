package in.craves.advanced.foodfacts;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.foodfacts.FoodFactsDtos.Badge;
import in.craves.advanced.foodfacts.FoodFactsDtos.ChefFactsView;
import in.craves.advanced.foodfacts.FoodFactsDtos.FactsContent;
import in.craves.advanced.foodfacts.FoodFactsDtos.FreeFromPage;
import in.craves.advanced.foodfacts.FoodFactsDtos.Ingredient;
import in.craves.advanced.foodfacts.FoodFactsDtos.Nutrition;
import in.craves.advanced.foodfacts.FoodFactsDtos.PublicFacts;
import in.craves.advanced.foodfacts.FoodFactsDtos.QueueEntry;
import in.craves.advanced.foodfacts.FoodFactsDtos.QueuePage;
import in.craves.advanced.foodfacts.FoodFactsDtos.Source;
import in.craves.advanced.foodfacts.FoodFactsRepository.Row;
import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.web.ApiProblem;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FoodFactsService {
    static final String DISCLAIMER = "Declared by the home chef. Facts marked Verified were checked by Craves staff against the chef's "
            + "evidence. Home kitchens can handle other allergens; if you have a severe allergy, ask the chef before ordering.";
    private final FoodFactsRepository facts;
    private final CatalogGateway catalog;
    private final Audit audit;
    private final ObjectMapper json;
    private final Clock clock;

    public FoodFactsService(FoodFactsRepository facts, CatalogGateway catalog, Audit audit, ObjectMapper json, Clock clock) {
        this.facts = facts;
        this.catalog = catalog;
        this.audit = audit;
        this.json = json;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ChefFactsView chefView(String chefToken, UUID menuItemId) {
        owned(chefToken, menuItemId);
        return facts.find(menuItemId, false).map(this::chefView)
                .orElse(new ChefFactsView(menuItemId, "NONE", 0, null, List.of(), null, null, null, null, null));
    }

    @Transactional
    public ChefFactsView saveDraft(UUID chef, String chefToken, UUID menuItemId, FactsContent requested, Long expectedVersion) {
        MenuItem item = owned(chefToken, menuItemId);
        FactsContent content = normalise(requested);
        String body = write(content);
        Instant now = clock.instant();
        var existing = facts.find(menuItemId, true);
        if (existing.isEmpty()) {
            if (expectedVersion != null && expectedVersion != 0) throw versionMismatch();
            facts.insertDraft(menuItemId, chef, item.kitchenId(), body, now);
        } else {
            Row row = existing.get();
            if (!row.chefId().equals(chef)) throw ApiProblem.forbidden("NOT_YOUR_MENU_ITEM", "This dish belongs to another chef");
            if (expectedVersion != null && expectedVersion != row.version()) throw versionMismatch();
            facts.updateDraft(menuItemId, item.kitchenId(), body, now);
        }
        Row saved = facts.find(menuItemId, false).orElseThrow();
        facts.revision(menuItemId, saved.version(), "DRAFT_SAVED", chef, body, now);
        return chefView(saved);
    }

    @Transactional
    public ChefFactsView submit(UUID chef, String chefToken, UUID menuItemId, Long expectedVersion) {
        owned(chefToken, menuItemId);
        Row row = facts.find(menuItemId, true).orElseThrow(() -> ApiProblem.notFound("FACTS_NOT_FOUND", "Save the facts first"));
        if (!row.chefId().equals(chef)) throw ApiProblem.forbidden("NOT_YOUR_MENU_ITEM", "This dish belongs to another chef");
        if (expectedVersion != null && expectedVersion != row.version()) throw versionMismatch();
        if ("SUBMITTED".equals(row.status()) || "VERIFIED".equals(row.status())) {
            throw ApiProblem.conflict("NOTHING_TO_SUBMIT", "Save a change before submitting again");
        }
        Instant now = clock.instant();
        facts.submit(menuItemId, now);
        facts.revision(menuItemId, row.version() + 1, "SUBMITTED", chef, row.content(), now);
        audit.record(FoodFactsModule.ID, chef, "FACTS_SUBMITTED", "menu_item", menuItemId, Map.of("version", row.version() + 1));
        return chefView(facts.find(menuItemId, false).orElseThrow());
    }

    @Transactional
    public void withdraw(UUID chef, String chefToken, UUID menuItemId) {
        owned(chefToken, menuItemId);
        Row row = facts.find(menuItemId, true).orElseThrow(() -> ApiProblem.notFound("FACTS_NOT_FOUND", "No facts for this dish"));
        if (!row.chefId().equals(chef)) throw ApiProblem.forbidden("NOT_YOUR_MENU_ITEM", "This dish belongs to another chef");
        facts.delete(menuItemId);
        facts.revision(menuItemId, row.version() + 1, "WITHDRAWN", chef, "{}", clock.instant());
        audit.record(FoodFactsModule.ID, chef, "FACTS_WITHDRAWN", "menu_item", menuItemId, Map.of());
    }

    @Transactional(readOnly = true)
    public PublicFacts publicFacts(UUID menuItemId) {
        Row row = facts.find(menuItemId, false).filter(r -> r.published() != null)
                .orElseThrow(() -> ApiProblem.notFound("FACTS_NOT_FOUND", "No ingredient or allergen facts for this dish yet"));
        FactsContent content = read(row.published());
        return new PublicFacts(menuItemId, row.publishedLabel(), content.ingredients(), content.allergens(), content.mayContain(),
                content.nutrition(), content.servingSizeGrams(), content.source().name(), row.publishedAt(), DISCLAIMER);
    }

    @Transactional(readOnly = true)
    public List<Badge> lookup(List<UUID> menuItemIds) {
        List<Badge> badges = new ArrayList<>();
        for (Row row : facts.published(menuItemIds.stream().distinct().toList())) {
            FactsContent content = read(row.published());
            badges.add(new Badge(row.menuItemId(), row.publishedLabel(), content.allergens(), content.mayContain(), content.nutrition() != null));
        }
        return badges;
    }

    @Transactional(readOnly = true)
    public FreeFromPage freeFrom(Set<Allergen> allergens, String cursor, int limit) {
        if (allergens.isEmpty()) throw ApiProblem.badRequest("ALLERGENS_REQUIRED", "Name at least one allergen");
        UUID after = cursor == null || cursor.isBlank() ? null : Cursor.decode(cursor).id();
        String[] names = allergens.stream().map(Enum::name).toArray(String[]::new);
        List<UUID> ids = facts.freeFrom(names, after, limit + 1);
        String next = ids.size() > limit ? new Cursor(Instant.EPOCH, ids.get(limit - 1)).encode() : null;
        return new FreeFromPage(ids.size() > limit ? ids.subList(0, limit) : ids, next);
    }

    @Transactional(readOnly = true)
    public QueuePage queue(String cursor, int limit) {
        Cursor position = Cursor.decode(cursor);
        List<Row> rows = facts.queue(position == null ? null : position.at(), position == null ? null : position.id(), limit + 1);
        List<QueueEntry> entries = new ArrayList<>();
        for (Row row : rows.subList(0, Math.min(limit, rows.size()))) {
            FactsContent content = read(row.content());
            entries.add(new QueueEntry(row.menuItemId(), row.chefId(), row.kitchenId(), row.version(), row.submittedAt(), content, warnings(content)));
        }
        String next = rows.size() > limit ? new Cursor(rows.get(limit - 1).submittedAt(), rows.get(limit - 1).menuItemId()).encode() : null;
        return new QueuePage(entries, next);
    }

    @Transactional
    public ChefFactsView review(UUID reviewer, UUID menuItemId, boolean approve, long expectedVersion, String note) {
        Row row = facts.find(menuItemId, true).orElseThrow(() -> ApiProblem.notFound("FACTS_NOT_FOUND", "No facts for this dish"));
        if (!"SUBMITTED".equals(row.status())) throw ApiProblem.conflict("NOT_SUBMITTED", "Only submitted facts can be reviewed");
        if (expectedVersion != row.version()) throw versionMismatch();
        if (!approve && (note == null || note.isBlank())) throw ApiProblem.badRequest("NOTE_REQUIRED", "Tell the chef what to fix");
        Instant now = clock.instant();
        String cleanNote = note == null || note.isBlank() ? null : note.strip();
        if (approve) facts.verify(menuItemId, reviewer, cleanNote, now);
        else facts.reject(menuItemId, reviewer, cleanNote, now);
        facts.revision(menuItemId, row.version() + 1, approve ? "VERIFIED" : "REJECTED", reviewer, row.content(), now);
        audit.record(FoodFactsModule.ID, reviewer, approve ? "FACTS_VERIFIED" : "FACTS_REJECTED", "menu_item", menuItemId,
                cleanNote == null ? Map.of() : Map.of("note", cleanNote));
        return chefView(facts.find(menuItemId, false).orElseThrow());
    }

    /** Allergens = declared ∪ every ingredient's allergens; "may contain" never repeats a contained allergen. */
    static FactsContent normalise(FactsContent content) {
        Set<Allergen> contains = EnumSet.noneOf(Allergen.class);
        if (content.allergens() != null) contains.addAll(content.allergens());
        List<Ingredient> ingredients = new ArrayList<>();
        for (Ingredient ingredient : content.ingredients()) {
            Set<Allergen> own = ingredient.allergens() == null ? EnumSet.noneOf(Allergen.class) : EnumSet.copyOf(nonEmpty(ingredient.allergens()));
            contains.addAll(own);
            ingredients.add(new Ingredient(ingredient.name().strip().replaceAll("\\s+", " "), new TreeSet<>(own)));
        }
        Set<Allergen> may = EnumSet.noneOf(Allergen.class);
        if (content.mayContain() != null) may.addAll(content.mayContain());
        may.removeAll(contains);
        String evidence = content.evidenceReference() == null || content.evidenceReference().isBlank() ? null : content.evidenceReference().strip();
        return new FactsContent(ingredients, new TreeSet<>(contains), new TreeSet<>(may), content.nutrition(), content.servingSizeGrams(),
                content.source(), evidence);
    }

    private static Set<Allergen> nonEmpty(Set<Allergen> set) {
        return set.isEmpty() ? EnumSet.noneOf(Allergen.class) : set;
    }

    /** Plausibility checks for staff and the chef; they never block a save. */
    static List<String> warnings(FactsContent content) {
        List<String> warnings = new ArrayList<>();
        Nutrition n = content.nutrition();
        if (n != null) {
            if (n.energyKcal() != null && n.proteinG() != null && n.carbohydrateG() != null && n.fatG() != null) {
                BigDecimal computed = n.proteinG().multiply(BigDecimal.valueOf(4)).add(n.carbohydrateG().multiply(BigDecimal.valueOf(4)))
                        .add(n.fatG().multiply(BigDecimal.valueOf(9)));
                BigDecimal gap = computed.subtract(n.energyKcal()).abs();
                BigDecimal tolerance = n.energyKcal().multiply(new BigDecimal("0.25")).max(BigDecimal.valueOf(25));
                if (gap.compareTo(tolerance) > 0) warnings.add("ENERGY_DOES_NOT_MATCH_MACRONUTRIENTS");
            }
            if (content.servingSizeGrams() != null) {
                BigDecimal macros = zero(n.proteinG()).add(zero(n.carbohydrateG())).add(zero(n.fatG())).add(zero(n.fibreG()));
                if (macros.compareTo(BigDecimal.valueOf(content.servingSizeGrams())) > 0) warnings.add("NUTRIENTS_EXCEED_SERVING_SIZE");
            }
            if (n.sugarsG() != null && n.carbohydrateG() != null && n.sugarsG().compareTo(n.carbohydrateG()) > 0) {
                warnings.add("SUGARS_EXCEED_CARBOHYDRATE");
            }
            if (n.saturatedFatG() != null && n.fatG() != null && n.saturatedFatG().compareTo(n.fatG()) > 0) {
                warnings.add("SATURATED_FAT_EXCEEDS_FAT");
            }
            if (content.servingSizeGrams() == null) warnings.add("SERVING_SIZE_MISSING");
        }
        if (content.source() != Source.CHEF_DECLARED && content.evidenceReference() == null) warnings.add("EVIDENCE_REFERENCE_MISSING");
        if ((content.allergens() == null || content.allergens().isEmpty()) && (content.mayContain() == null || content.mayContain().isEmpty())) {
            warnings.add("NO_ALLERGENS_DECLARED");
        }
        return warnings;
    }

    private static BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private MenuItem owned(String chefToken, UUID menuItemId) {
        Map<UUID, MenuItem> mine = catalog.chefMenuItems(chefToken);
        MenuItem item = mine.get(menuItemId);
        if (item == null) throw ApiProblem.forbidden("NOT_YOUR_MENU_ITEM", "This dish is not on your menu");
        return item;
    }

    private ChefFactsView chefView(Row row) {
        FactsContent content = read(row.content());
        return new ChefFactsView(row.menuItemId(), row.status(), row.version(), content, warnings(content), row.publishedLabel(),
                row.submittedAt(), row.reviewedAt(), row.reviewNote(), row.updatedAt());
    }

    private String write(FactsContent content) {
        try {
            return json.writeValueAsString(content);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private FactsContent read(String body) {
        try {
            // Sets come back from JSON as hash sets: normalise again so every answer lists allergens in a stable order.
            return normalise(json.readValue(body, FactsContent.class));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Stored facts are unreadable", ex);
        }
    }

    private static ApiProblem versionMismatch() {
        return new ApiProblem(412, "VERSION_MISMATCH", "These facts changed since you loaded them; reload and try again");
    }
}
