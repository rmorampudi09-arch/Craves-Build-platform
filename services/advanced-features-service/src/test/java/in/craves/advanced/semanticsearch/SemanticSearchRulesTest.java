package in.craves.advanced.semanticsearch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.advanced.platform.clients.MenuSearchGateway.FoundDish;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.PlannedSearch;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchConceptView;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchPlan;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SemanticSearchRulesTest {
    static SearchConceptView concept(String phrase, List<String> terms, String foodType, String spice, boolean active) {
        return new SearchConceptView(UUID.randomUUID(), phrase, terms, foodType, spice, null, active, 1, null);
    }

    static FoundDish dish(UUID id, String name) {
        return new FoundDish(id, UUID.randomUUID(), "K", name, null, null, null, null, 10000L, 100, null);
    }

    @Test
    void normalizesAnyScriptAndRefusesEmptyOrLongQueries() {
        assertThat(SemanticSearchRules.normalize("  Comfort-FOOD!!  ")).isEqualTo("comfort food");
        assertThat(SemanticSearchRules.normalize("पनीर   टिक्का")).isEqualTo("पनीर टिक्का");
        assertThat(SemanticSearchRules.normalize("ｄａｌ\u0000")).isEqualTo("dal");
        assertThatThrownBy(() -> SemanticSearchRules.checkedQuery("?!")).isInstanceOf(ApiProblem.class);
        assertThatThrownBy(() -> SemanticSearchRules.checkedQuery("x".repeat(121))).isInstanceOf(ApiProblem.class);
    }

    @Test
    void longestPhraseWinsAndLeftoverWordsAreTheirOwnSearch() {
        List<SearchConceptView> concepts = List.of(concept("comfort food", List.of("khichdi", "dal"), null, null, true),
                concept("comfort", List.of("soup"), null, null, true), concept("spicy", List.of(), null, "SPICY", true),
                concept("old", List.of("ignored"), null, null, false));
        SearchPlan plan = SemanticSearchRules.plan("Spicy comfort food tonight old", "spicy comfort food tonight old", concepts);
        assertThat(plan.matchedPhrases()).containsExactly("spicy", "comfort food");
        assertThat(plan.searches()).containsExactly(new PlannedSearch("tonight old", true), new PlannedSearch("khichdi", false),
                new PlannedSearch("dal", false));
        assertThat(plan.spiceLevel()).isEqualTo("SPICY");
    }

    @Test
    void filtersOnlyAndDisagreeingFiltersAreDropped() {
        SearchPlan vegOnly = SemanticSearchRules.plan("veg", "veg", List.of(concept("veg", List.of(), "VEG", null, true)));
        assertThat(vegOnly.searches()).containsExactly(new PlannedSearch(null, false));
        assertThat(vegOnly.foodType()).isEqualTo("VEG");
        SearchPlan clash = SemanticSearchRules.plan("veg chicken", "veg chicken",
                List.of(concept("veg", List.of(), "VEG", null, true), concept("chicken", List.of("chicken"), "NON_VEG", null, true)));
        assertThat(clash.foodType()).isNull();
        assertThat(clash.searches()).containsExactly(new PlannedSearch("chicken", false));
    }

    @Test
    void ownWordsCountDoubleAndTiesKeepCatalogsOrder() {
        UUID a = UUID.randomUUID(), b = UUID.randomUUID(), c = UUID.randomUUID();
        List<PlannedSearch> searches = List.of(new PlannedSearch("dal", true), new PlannedSearch("khichdi", false));
        var merged = SemanticSearchRules.merge(searches, List.of(List.of(dish(a, "Dal"), dish(b, "Dal khichdi")), List.of(dish(c, "Khichdi"), dish(b, "Dal khichdi"))));
        assertThat(merged).extracting(d -> d.menuItemId()).containsExactly(b, a, c);
        assertThat(merged.get(0).score()).isEqualTo(3);
        assertThat(merged.get(0).matchedBy()).containsExactly("dal", "khichdi");
    }
}
