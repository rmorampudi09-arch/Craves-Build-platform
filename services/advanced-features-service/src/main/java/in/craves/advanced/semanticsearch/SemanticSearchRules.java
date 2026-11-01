package in.craves.advanced.semanticsearch;

import in.craves.advanced.platform.clients.MenuSearchGateway.FoundDish;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.PlannedSearch;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchConceptView;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchPlan;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SemanticDish;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

final class SemanticSearchRules {
    static final int MAX_QUERY = 120;
    static final int MAX_PHRASE_WORDS = 4;
    /** Each public request fans out into at most this many Catalog calls. */
    static final int MAX_SEARCHES = 3;
    static final int MAX_RESULTS = 50;

    private SemanticSearchRules() { }

    /** NFKC, lower case, letters/digits (any script) kept, everything else a single space. */
    static String normalize(String text) {
        if (text == null) return "";
        String folded = Normalizer.normalize(text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        StringBuilder out = new StringBuilder();
        folded.codePoints().forEach(c -> out.appendCodePoint(Character.isLetterOrDigit(c) || Character.getType(c) == Character.NON_SPACING_MARK
                || Character.getType(c) == Character.COMBINING_SPACING_MARK ? c : ' '));
        return out.toString().trim().replaceAll(" +", " ");
    }

    static String checkedQuery(String query) {
        if (query == null || query.codePointCount(0, query.length()) > MAX_QUERY) {
            throw ApiProblem.badRequest("INVALID_QUERY", "q must be 1 to " + MAX_QUERY + " characters");
        }
        String normalized = normalize(query);
        if (normalized.isEmpty()) throw ApiProblem.badRequest("INVALID_QUERY", "q must contain letters or digits");
        return normalized;
    }

    /** Longest phrase first at each word; unmatched words stay as the person's own search, which always runs first. */
    static SearchPlan plan(String query, String normalized, List<SearchConceptView> concepts) {
        Map<String, SearchConceptView> byPhrase = new LinkedHashMap<>();
        concepts.stream().filter(SearchConceptView::active).forEach(c -> byPhrase.put(c.phrase(), c));
        String[] words = normalized.split(" ");
        List<String> residual = new ArrayList<>();
        List<SearchConceptView> matched = new ArrayList<>();
        for (int i = 0; i < words.length; ) {
            int taken = 0;
            for (int n = Math.min(MAX_PHRASE_WORDS, words.length - i); n >= 1 && taken == 0; n--) {
                SearchConceptView concept = byPhrase.get(String.join(" ", Arrays.copyOfRange(words, i, i + n)));
                if (concept != null) {
                    matched.add(concept);
                    taken = n;
                }
            }
            if (taken == 0) {
                residual.add(words[i]);
                taken = 1;
            }
            i += taken;
        }
        Set<String> texts = new LinkedHashSet<>();
        List<PlannedSearch> searches = new ArrayList<>();
        if (!residual.isEmpty()) {
            String own = String.join(" ", residual);
            texts.add(own);
            searches.add(new PlannedSearch(own, true));
        }
        for (SearchConceptView concept : matched) {
            for (String term : concept.searchTerms()) {
                if (searches.size() < MAX_SEARCHES && texts.add(term)) searches.add(new PlannedSearch(term, false));
            }
        }
        String foodType = agreed(matched.stream().map(SearchConceptView::foodType).toList());
        String spiceLevel = agreed(matched.stream().map(SearchConceptView::spiceLevel).toList());
        String category = agreed(matched.stream().map(SearchConceptView::category).toList());
        if (searches.isEmpty()) searches.add(new PlannedSearch(null, false)); // only filters were meant ("veg", "spicy")
        return new SearchPlan(query, normalized, matched.stream().map(SearchConceptView::phrase).toList(), List.copyOf(searches), foodType,
                spiceLevel, category);
    }

    /** One value when every concept that sets it agrees; none when they disagree ("veg" and "chicken" together). */
    private static String agreed(List<String> values) {
        Set<String> set = new LinkedHashSet<>();
        values.stream().filter(Objects::nonNull).forEach(set::add);
        return set.size() == 1 ? set.iterator().next() : null;
    }

    /** Merges per-search results: higher score first, then the earliest Catalog position (nearest first) across the searches. */
    static List<SemanticDish> merge(List<PlannedSearch> searches, List<List<FoundDish>> results) {
        record Hit(FoundDish dish, int score, int firstPosition, List<String> matchedBy) { }
        Map<UUID, Hit> hits = new LinkedHashMap<>();
        for (int s = 0; s < results.size(); s++) {
            PlannedSearch search = searches.get(s);
            String label = search.text() == null ? "filters" : search.text();
            List<FoundDish> found = results.get(s);
            for (int position = 0; position < found.size(); position++) {
                FoundDish dish = found.get(position);
                int points = search.ownWords() ? 2 : 1;
                int at = position;
                hits.merge(dish.menuItemId(), new Hit(dish, points, at, List.of(label)), (a, b) -> a.matchedBy().contains(label) ? a
                        : new Hit(a.dish(), a.score() + b.score(), Math.min(a.firstPosition(), b.firstPosition()), concat(a.matchedBy(), label)));
            }
        }
        return hits.values().stream().sorted(Comparator.comparingInt(Hit::score).reversed().thenComparingInt(Hit::firstPosition))
                .limit(MAX_RESULTS).map(h -> {
                    FoundDish d = h.dish();
                    return new SemanticDish(d.menuItemId(), d.kitchenId(), d.kitchenName(), d.itemName(), d.description(), d.category(),
                            d.foodType(), d.spiceLevel(), d.pricePaise(), d.distanceMeters(), d.imageUrl(), h.score(), h.matchedBy());
                }).toList();
    }

    private static List<String> concat(List<String> list, String item) {
        List<String> out = new ArrayList<>(list);
        out.add(item);
        return List.copyOf(out);
    }
}
