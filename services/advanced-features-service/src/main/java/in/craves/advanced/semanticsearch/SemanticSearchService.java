package in.craves.advanced.semanticsearch;

import in.craves.advanced.platform.clients.MenuSearchGateway;
import in.craves.advanced.platform.clients.MenuSearchGateway.FoundDish;
import in.craves.advanced.platform.clients.MenuSearchGateway.MenuSearch;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.PlannedSearch;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchConceptDraft;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchConceptView;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchPlan;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SemanticSearchResult;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Nothing about the person searching is stored or logged here; Catalog decides what is shown and where. */
@Service
public class SemanticSearchService {
    static final int PER_SEARCH = 20;
    /** shortcut: searches run one after another; after this budget the rest are skipped and complete=false. Run them in parallel if it bites. */
    static final long BUDGET_NANOS = 3_000_000_000L;
    private final SemanticSearchRepository repository;
    private final MenuSearchGateway catalog;
    private final Audit audit;
    private final Clock clock;

    public SemanticSearchService(SemanticSearchRepository repository, MenuSearchGateway catalog, Audit audit, Clock clock) {
        this.repository = repository;
        this.catalog = catalog;
        this.audit = audit;
        this.clock = clock;
    }

    /** Per-replica snapshot so public searches rarely touch the shared pool; changes on this replica refresh it at once, others within 30 s. */
    static final long CONCEPTS_TTL_NANOS = 30_000_000_000L;
    private volatile List<SearchConceptView> concepts;
    private volatile long conceptsReadAt;

    public SearchPlan plan(String query) {
        String normalized = SemanticSearchRules.checkedQuery(query);
        return SemanticSearchRules.plan(query.strip(), normalized, activeConcepts());
    }

    private List<SearchConceptView> activeConcepts() {
        List<SearchConceptView> snapshot = concepts;
        if (snapshot == null || System.nanoTime() - conceptsReadAt > CONCEPTS_TTL_NANOS) {
            snapshot = repository.active();
            concepts = snapshot;
            conceptsReadAt = System.nanoTime();
        }
        return snapshot;
    }

    /** Not transactional: the concepts are read first, then Catalog is asked with no database connection held. */
    public SemanticSearchResult search(String query, BigDecimal latitude, BigDecimal longitude, int radiusMeters) {
        if (latitude == null || longitude == null || latitude.abs().compareTo(BigDecimal.valueOf(90)) > 0
                || longitude.abs().compareTo(BigDecimal.valueOf(180)) > 0 || radiusMeters <= 0) {
            throw ApiProblem.badRequest("INVALID_LOCATION", "latitude must be within ±90, longitude within ±180 and radiusMeters above 0");
        }
        // Bounded scale: a value like 1e-999999999 would otherwise become a gigantic string in the Catalog URL.
        BigDecimal lat = latitude.setScale(6, RoundingMode.HALF_UP);
        BigDecimal lng = longitude.setScale(6, RoundingMode.HALF_UP);
        SearchPlan plan = plan(query);
        long deadline = System.nanoTime() + BUDGET_NANOS;
        List<List<FoundDish>> results = new ArrayList<>();
        boolean complete = true;
        RuntimeException firstFailure = null;
        for (PlannedSearch search : plan.searches()) {
            if (!results.isEmpty() && System.nanoTime() > deadline) {
                complete = false;
                break;
            }
            try {
                results.add(catalog.nearbyDishes(new MenuSearch(lat, lng, radiusMeters, search.text(), plan.foodType(),
                        plan.spiceLevel(), plan.category(), PER_SEARCH)));
            } catch (ApiProblem problem) {
                // The first search failing 400 is about the location or radius (every search would fail alike); a later one is a bad concept term.
                if (problem.status() == 400 && results.isEmpty()) throw problem;
                if (firstFailure == null) firstFailure = problem;
                results.add(List.of());
                complete = false;
            }
        }
        if (firstFailure != null && results.stream().allMatch(List::isEmpty)) throw firstFailure;
        return new SemanticSearchResult(plan, complete, SemanticSearchRules.merge(plan.searches(), results));
    }

    @Transactional(readOnly = true)
    public List<SearchConceptView> concepts() {
        return repository.all();
    }

    @Transactional
    public SearchConceptView create(UUID staff, SearchConceptDraft draft) {
        SearchConceptView concept = checked(UUID.randomUUID(), draft, 1);
        try {
            repository.insert(concept, staff, clock.instant());
            concepts = null;
        } catch (DuplicateKeyException race) {
            throw ApiProblem.conflict("PHRASE_TAKEN", "Another concept already uses this phrase");
        }
        audit.record(SemanticSearchModule.ID, staff, "SEARCH_CONCEPT_CREATED", "search_concept", concept.id(), Map.of("phrase", concept.phrase()));
        return repository.one(concept.id(), false).orElseThrow();
    }

    @Transactional
    public SearchConceptView change(UUID staff, UUID id, SearchConceptDraft draft) {
        if (draft.expectedVersion() == null) throw ApiProblem.badRequest("VERSION_REQUIRED", "Send the expectedVersion you loaded");
        SearchConceptView current = repository.one(id, true).orElseThrow(() -> ApiProblem.notFound("CONCEPT_NOT_FOUND", "No such search concept"));
        if (current.version() != draft.expectedVersion()) throw new ApiProblem(412, "VERSION_MISMATCH", "This changed since you loaded it; reload and try again");
        SearchConceptView concept = checked(id, draft, current.version());
        try {
            repository.update(concept, staff, clock.instant());
            concepts = null;
        } catch (DuplicateKeyException race) {
            throw ApiProblem.conflict("PHRASE_TAKEN", "Another concept already uses this phrase");
        }
        audit.record(SemanticSearchModule.ID, staff, "SEARCH_CONCEPT_CHANGED", "search_concept", id, Map.of("phrase", concept.phrase(), "active", concept.active()));
        return repository.one(id, false).orElseThrow();
    }

    /** Phrase and terms are stored normalized (the same way queries are), so matching is exact and control characters cannot get in. */
    private SearchConceptView checked(UUID id, SearchConceptDraft draft, long version) {
        List<String> problems = new ArrayList<>();
        String phrase = SemanticSearchRules.normalize(draft.phrase());
        if (phrase.isEmpty() || phrase.length() > 60 || phrase.split(" ").length > SemanticSearchRules.MAX_PHRASE_WORDS) {
            problems.add("phrase must be 1 to " + SemanticSearchRules.MAX_PHRASE_WORDS + " words of letters or digits, at most 60 characters");
        }
        LinkedHashSet<String> terms = new LinkedHashSet<>();
        for (String term : draft.searchTerms()) {
            String normalized = SemanticSearchRules.normalize(term);
            // Normalizing can lengthen text (NFKC); Catalog accepts at most 120 characters per search.
            if (normalized.isEmpty() || normalized.length() > 40) problems.add("search terms must be 1 to 40 letters or digits once normalized");
            else terms.add(normalized);
        }
        String category = draft.category() == null || draft.category().isBlank() ? null : draft.category().strip();
        if (category != null && category.chars().anyMatch(Character::isISOControl)) problems.add("category must not contain control characters");
        if (terms.isEmpty() && draft.foodType() == null && draft.spiceLevel() == null && category == null) {
            problems.add("give at least one search term or filter");
        }
        if (!problems.isEmpty()) throw new ApiProblem(400, "INVALID_CONCEPT", "The concept cannot be saved", List.copyOf(new LinkedHashSet<>(problems)));
        if (repository.phraseTaken(phrase, id)) throw ApiProblem.conflict("PHRASE_TAKEN", "Another concept already uses this phrase");
        return new SearchConceptView(id, phrase, List.copyOf(terms), draft.foodType(), draft.spiceLevel(), category,
                draft.active() == null || draft.active(), version, null);
    }
}
