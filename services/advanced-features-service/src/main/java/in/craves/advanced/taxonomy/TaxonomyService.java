package in.craves.advanced.taxonomy;

import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.taxonomy.TaxonomyDtos.AdminTerm;
import in.craves.advanced.taxonomy.TaxonomyDtos.ChefTagsView;
import in.craves.advanced.taxonomy.TaxonomyDtos.DishBrowsePage;
import in.craves.advanced.taxonomy.TaxonomyDtos.DishTags;
import in.craves.advanced.taxonomy.TaxonomyDtos.Kind;
import in.craves.advanced.taxonomy.TaxonomyDtos.LabelResolution;
import in.craves.advanced.taxonomy.TaxonomyDtos.NewTerm;
import in.craves.advanced.taxonomy.TaxonomyDtos.StaffTagRequest;
import in.craves.advanced.taxonomy.TaxonomyDtos.Status;
import in.craves.advanced.taxonomy.TaxonomyDtos.TagRequest;
import in.craves.advanced.taxonomy.TaxonomyDtos.TaxonomyTerm;
import in.craves.advanced.taxonomy.TaxonomyDtos.TaxonomyVocabulary;
import in.craves.advanced.taxonomy.TaxonomyDtos.TermChange;
import in.craves.advanced.taxonomy.TaxonomyDtos.TermRef;
import in.craves.advanced.taxonomy.TaxonomyRepository.Row;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TaxonomyService {
    static final String DISCLAIMER = "Cuisine and diet labels are declared by the home chef; Craves staff may correct them. "
            + "If you follow a strict diet, ask the chef before ordering.";
    private static final int MAX_DIETS = 6;
    private static final int MAX_LABELS = 20;

    private record Tags(List<String> cuisines, List<String> diets) { }

    private final TaxonomyRepository repository;
    private final CatalogGateway catalog;
    private final Audit audit;
    private final Clock clock;

    public TaxonomyService(TaxonomyRepository repository, CatalogGateway catalog, Audit audit, Clock clock) {
        this.repository = repository;
        this.catalog = catalog;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public TaxonomyVocabulary vocabulary() {
        List<TaxonomyTerm> live = TaxonomyRules.treeOrder(repository.terms()).stream()
                .map(term -> new TaxonomyTerm(term.code(), term.kind(), term.parentCode(), term.name(), term.description())).toList();
        return new TaxonomyVocabulary(live.stream().filter(term -> term.kind() == Kind.CUISINE).toList(),
                live.stream().filter(term -> term.kind() == Kind.DIET).toList(), DISCLAIMER);
    }

    /** Maps free text (for example a kitchen's own cuisine words) to live terms by code, name or alias. */
    @Transactional(readOnly = true)
    public List<LabelResolution> resolve(List<String> labels) {
        List<String> asked = labels.stream().map(String::strip).filter(label -> !label.isEmpty()).distinct().toList();
        if (asked.isEmpty()) throw ApiProblem.badRequest("LABELS_REQUIRED", "Name at least one label");
        if (asked.size() > MAX_LABELS) throw ApiProblem.badRequest("TOO_MANY_LABELS", "Resolve at most " + MAX_LABELS + " labels at once");
        if (asked.stream().anyMatch(label -> label.length() > 60)) throw ApiProblem.badRequest("LABEL_TOO_LONG", "Labels are at most 60 characters");
        Map<String, AdminTerm> index = new HashMap<>();
        for (AdminTerm term : repository.terms()) {
            if (term.status() == Status.ACTIVE) TaxonomyRules.labels(term).forEach(key -> index.putIfAbsent(key, term));
        }
        return asked.stream().map(label -> {
            AdminTerm term = index.get(TaxonomyRules.normalise(label));
            return term == null ? new LabelResolution(label, null, null, null) : new LabelResolution(label, term.code(), term.kind(), term.name());
        }).toList();
    }

    /** Dishes labelled with the cuisine (or any cuisine below it) and with every one of the diets. */
    @Transactional(readOnly = true)
    public DishBrowsePage browse(String cuisine, List<String> diets, String cursor, int limit) {
        String wantedCuisine = cuisine == null || cuisine.isBlank() ? null : cuisine.strip().toLowerCase(Locale.ROOT);
        List<String> wantedDiets = diets == null ? List.of()
                : diets.stream().map(diet -> diet.strip().toLowerCase(Locale.ROOT)).filter(diet -> !diet.isEmpty()).distinct().toList();
        if (wantedCuisine == null && wantedDiets.isEmpty()) throw ApiProblem.badRequest("FILTER_REQUIRED", "Name a cuisine, a diet or both");
        if (wantedDiets.size() > MAX_DIETS) throw ApiProblem.badRequest("TOO_MANY_DIETS", "Filter by at most " + MAX_DIETS + " diets");
        List<AdminTerm> terms = repository.terms();
        List<String> unknown = TaxonomyRules.unknown(wantedCuisine == null ? List.of() : List.of(wantedCuisine), wantedDiets, byCode(terms));
        if (!unknown.isEmpty()) throw new ApiProblem(400, "UNKNOWN_TERM", "Use cuisine and diet codes from the vocabulary", unknown);
        String[] cuisines = wantedCuisine == null ? null : TaxonomyRules.subtree(wantedCuisine, terms).toArray(String[]::new);
        Cursor position = Cursor.decode(cursor);
        List<UUID> ids = repository.browse(cuisines, wantedDiets.toArray(String[]::new), position == null ? null : position.id(), limit + 1);
        String next = ids.size() > limit ? new Cursor(Instant.EPOCH, ids.get(limit - 1)).encode() : null;
        return new DishBrowsePage(ids.size() > limit ? ids.subList(0, limit) : ids, next);
    }

    @Transactional(readOnly = true)
    public DishTags dishTags(UUID menuItemId) {
        Row row = repository.tags(menuItemId, false)
                .orElseThrow(() -> ApiProblem.notFound("TAGS_NOT_FOUND", "This dish has no cuisine or diet labels yet"));
        return publicView(row, byCode(repository.terms()));
    }

    @Transactional(readOnly = true)
    public List<DishTags> lookup(List<UUID> menuItemIds) {
        Map<String, AdminTerm> byCode = byCode(repository.terms());
        return repository.tags(menuItemIds.stream().distinct().toList()).stream().map(row -> publicView(row, byCode)).toList();
    }

    @Transactional(readOnly = true)
    public ChefTagsView chefView(String chefToken, UUID menuItemId) {
        owned(chefToken, menuItemId);
        return repository.tags(menuItemId, false).map(TaxonomyService::chefView)
                .orElse(new ChefTagsView(menuItemId, 0, List.of(), List.of(), null, null));
    }

    @Transactional
    public ChefTagsView setTags(UUID chef, String chefToken, UUID menuItemId, TagRequest request, Long expectedVersion) {
        owned(chefToken, menuItemId);
        Tags tags = valid(request.cuisines(), request.diets());
        Instant now = clock.instant();
        Optional<Row> existing = repository.tags(menuItemId, true);
        if (existing.isEmpty()) {
            if (expectedVersion != null && expectedVersion != 0) throw versionMismatch();
            repository.insertTags(menuItemId, chef, tags.cuisines(), tags.diets(), now);
        } else {
            Row row = existing.get();
            if (!row.chefId().equals(chef)) throw ApiProblem.forbidden("NOT_YOUR_MENU_ITEM", "This dish belongs to another chef");
            if (expectedVersion != null && expectedVersion != row.version()) throw versionMismatch();
            repository.updateTags(menuItemId, tags.cuisines(), tags.diets(), "CHEF", chef, now);
        }
        audit.record(TaxonomyModule.ID, chef, "TAGS_SET", "menu_item", menuItemId, Map.of("cuisines", tags.cuisines(), "diets", tags.diets()));
        return chefView(repository.tags(menuItemId, false).orElseThrow());
    }

    @Transactional
    public void clearTags(UUID chef, String chefToken, UUID menuItemId) {
        owned(chefToken, menuItemId);
        Row row = repository.tags(menuItemId, true).orElseThrow(() -> ApiProblem.notFound("TAGS_NOT_FOUND", "This dish has no labels"));
        if (!row.chefId().equals(chef)) throw ApiProblem.forbidden("NOT_YOUR_MENU_ITEM", "This dish belongs to another chef");
        repository.deleteTags(menuItemId);
        audit.record(TaxonomyModule.ID, chef, "TAGS_CLEARED", "menu_item", menuItemId, Map.of());
    }

    /** Staff correction of a dish's labels (for example a diet the dish does not meet). Always audited with the reason. */
    @Transactional
    public ChefTagsView correctTags(UUID staff, UUID menuItemId, StaffTagRequest request) {
        Row row = repository.tags(menuItemId, true)
                .orElseThrow(() -> ApiProblem.notFound("TAGS_NOT_FOUND", "This dish has no labels to correct"));
        if (request.expectedVersion() != row.version()) throw versionMismatch();
        Tags tags = valid(request.cuisines(), request.diets());
        repository.updateTags(menuItemId, tags.cuisines(), tags.diets(), "STAFF", staff, clock.instant());
        audit.record(TaxonomyModule.ID, staff, "TAGS_CORRECTED", "menu_item", menuItemId, Map.of("note", request.note().strip(),
                "before", Map.of("cuisines", row.cuisines(), "diets", row.diets()),
                "after", Map.of("cuisines", tags.cuisines(), "diets", tags.diets())));
        return chefView(repository.tags(menuItemId, false).orElseThrow());
    }

    @Transactional(readOnly = true)
    public List<AdminTerm> adminTerms() {
        return repository.terms();
    }

    @Transactional
    public AdminTerm createTerm(UUID staff, NewTerm request) {
        repository.lockTerms();
        List<AdminTerm> terms = repository.terms();
        Map<String, AdminTerm> byCode = byCode(terms);
        if (byCode.containsKey(request.code())) throw ApiProblem.conflict("TERM_EXISTS", "A term with this code already exists");
        AdminTerm term = new AdminTerm(request.code(), request.kind(), blankToNull(request.parentCode()), request.name().strip(),
                blankToNull(request.description()), aliases(request.aliases()), request.sortOrder() == null ? 0 : request.sortOrder(),
                Status.ACTIVE, 1, null);
        checkPlacement(term, byCode);
        checkLabels(term, terms);
        repository.insertTerm(term, staff, clock.instant());
        audit.record(TaxonomyModule.ID, staff, "TERM_CREATED", "term", term.code(), Map.of("kind", term.kind().name(), "name", term.name()));
        return byCode(repository.terms()).get(term.code());
    }

    @Transactional
    public AdminTerm updateTerm(UUID staff, String code, TermChange change) {
        repository.lockTerms();
        List<AdminTerm> terms = repository.terms();
        Map<String, AdminTerm> byCode = byCode(terms);
        AdminTerm current = byCode.get(code);
        if (current == null) throw ApiProblem.notFound("TERM_NOT_FOUND", "No term with this code");
        if (change.expectedVersion() != current.version()) throw versionMismatch();
        AdminTerm term = new AdminTerm(code, current.kind(), blankToNull(change.parentCode()), change.name().strip(),
                blankToNull(change.description()), aliases(change.aliases()), change.sortOrder(), change.status(), current.version(),
                current.updatedAt());
        checkPlacement(term, byCode);
        if (term.status() == Status.RETIRED && terms.stream().anyMatch(t -> code.equals(t.parentCode()) && t.status() == Status.ACTIVE)) {
            throw ApiProblem.conflict("TERM_HAS_LIVE_CHILDREN", "Retire or move the cuisines below this one first");
        }
        checkLabels(term, terms);
        repository.updateTerm(term, staff, clock.instant());
        String action = current.status() == term.status() ? "TERM_UPDATED" : term.status() == Status.RETIRED ? "TERM_RETIRED" : "TERM_RESTORED";
        audit.record(TaxonomyModule.ID, staff, action, "term", code,
                Map.of("version", current.version() + 1, "name", term.name(), "status", term.status().name()));
        return byCode(repository.terms()).get(code);
    }

    private static void checkPlacement(AdminTerm term, Map<String, AdminTerm> byCode) {
        if (term.parentCode() == null) return;
        if (term.kind() == Kind.DIET) throw ApiProblem.badRequest("DIET_HAS_NO_PARENT", "Diet terms do not sit under another term");
        AdminTerm parent = byCode.get(term.parentCode());
        if (parent == null || parent.kind() != Kind.CUISINE) throw ApiProblem.badRequest("UNKNOWN_PARENT", "The parent must be a cuisine term");
        if (term.status() == Status.ACTIVE && parent.status() != Status.ACTIVE) {
            throw ApiProblem.badRequest("PARENT_RETIRED", "Restore the parent cuisine first");
        }
        if (TaxonomyRules.createsCycle(term.code(), term.parentCode(), byCode)) {
            throw ApiProblem.conflict("PARENT_CYCLE", "A cuisine cannot sit under itself or under one of its own cuisines");
        }
    }

    /** A live term's code, name and aliases must not be claimed by another live term. */
    private static void checkLabels(AdminTerm term, Collection<AdminTerm> terms) {
        List<AdminTerm> after = new ArrayList<>(terms.stream().filter(other -> !other.code().equals(term.code())).toList());
        after.add(term);
        Set<String> clashes = TaxonomyRules.collisions(after);
        clashes.retainAll(TaxonomyRules.labels(term));
        if (!clashes.isEmpty()) {
            throw new ApiProblem(409, "LABEL_IN_USE", "Another live term already answers to this name or alias", List.copyOf(clashes));
        }
    }

    private Tags valid(List<String> cuisines, List<String> diets) {
        Tags tags = new Tags(cuisines.stream().distinct().toList(), diets == null ? List.of() : diets.stream().distinct().toList());
        List<String> unknown = TaxonomyRules.unknown(tags.cuisines(), tags.diets(), byCode(repository.terms()));
        if (!unknown.isEmpty()) throw new ApiProblem(400, "UNKNOWN_TERM", "Use cuisine and diet codes from the vocabulary", unknown);
        return tags;
    }

    private void owned(String chefToken, UUID menuItemId) {
        if (!catalog.chefMenuItems(chefToken).containsKey(menuItemId)) {
            throw ApiProblem.forbidden("NOT_YOUR_MENU_ITEM", "This dish is not on your menu");
        }
    }

    private static DishTags publicView(Row row, Map<String, AdminTerm> byCode) {
        return new DishTags(row.menuItemId(), refs(row.cuisines(), byCode), refs(row.diets(), byCode), row.setBy(), row.updatedAt());
    }

    /** Retired terms drop out of public answers; the stored labels stay for history. */
    private static List<TermRef> refs(List<String> codes, Map<String, AdminTerm> byCode) {
        return codes.stream().map(byCode::get).filter(term -> term != null && term.status() == Status.ACTIVE)
                .map(term -> new TermRef(term.code(), term.name())).toList();
    }

    private static ChefTagsView chefView(Row row) {
        return new ChefTagsView(row.menuItemId(), row.version(), row.cuisines(), row.diets(), row.setBy(), row.updatedAt());
    }

    private static Map<String, AdminTerm> byCode(List<AdminTerm> terms) {
        return terms.stream().collect(Collectors.toMap(AdminTerm::code, Function.identity()));
    }

    private static List<String> aliases(List<String> aliases) {
        return aliases == null ? List.of() : aliases.stream().map(alias -> alias.strip().replaceAll("\\s+", " ")).distinct().toList();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static ApiProblem versionMismatch() {
        return new ApiProblem(412, "VERSION_MISMATCH", "This changed since you loaded it; reload and try again");
    }
}
