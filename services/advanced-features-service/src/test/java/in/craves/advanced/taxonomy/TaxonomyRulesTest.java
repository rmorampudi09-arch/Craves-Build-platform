package in.craves.advanced.taxonomy;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.advanced.taxonomy.TaxonomyDtos.AdminTerm;
import in.craves.advanced.taxonomy.TaxonomyDtos.Kind;
import in.craves.advanced.taxonomy.TaxonomyDtos.Status;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class TaxonomyRulesTest {
    static AdminTerm term(String code, Kind kind, String parent, String name, int sort, Status status, String... aliases) {
        return new AdminTerm(code, kind, parent, name, null, List.of(aliases), sort, status, 1, null);
    }

    static final List<AdminTerm> TERMS = List.of(
            term("north-indian", Kind.CUISINE, null, "North Indian", 20, Status.ACTIVE),
            term("south-indian", Kind.CUISINE, null, "South Indian", 10, Status.ACTIVE),
            term("karnataka", Kind.CUISINE, "south-indian", "Karnataka", 40, Status.ACTIVE, "kannada"),
            term("hyderabadi", Kind.CUISINE, "south-indian", "Hyderabadi", 10, Status.ACTIVE, "hyd", "Deccani"),
            term("udupi", Kind.CUISINE, "karnataka", "Udupi", 10, Status.ACTIVE),
            term("old-style", Kind.CUISINE, "south-indian", "Old style", 5, Status.RETIRED, "hyd"),
            term("jain", Kind.DIET, null, "Jain", 10, Status.ACTIVE));

    static Map<String, AdminTerm> byCode(List<AdminTerm> terms) {
        return terms.stream().collect(Collectors.toMap(AdminTerm::code, Function.identity()));
    }

    @Test
    void labelsIgnoreCasePunctuationAndSpacingInAnyScript() {
        assertThat(TaxonomyRules.normalise("  No onion,   no-GARLIC! ")).isEqualTo("no onion no garlic");
        assertThat(TaxonomyRules.normalise("హైదరాబాదీ బిర్యానీ")).isEqualTo("హైదరాబాదీ బిర్యానీ");
        assertThat(TaxonomyRules.labels(TERMS.get(3))).containsExactly("hyderabadi", "hyd", "deccani");
    }

    @Test
    void onlyLiveTermsCanClashOnALabel() {
        assertThat(TaxonomyRules.collisions(TERMS)).isEmpty();
        AdminTerm clash = term("kannadiga", Kind.CUISINE, "south-indian", "Kannadiga", 50, Status.ACTIVE, "Kannada");
        assertThat(TaxonomyRules.collisions(List.of(TERMS.get(2), clash))).containsExactly("kannada");
    }

    @Test
    void treeOrderPutsEachCuisineUnderItsParentAndSkipsRetiredTerms() {
        assertThat(TaxonomyRules.treeOrder(TERMS).stream().map(AdminTerm::code))
                .containsExactly("jain", "south-indian", "hyderabadi", "karnataka", "udupi", "north-indian");
    }

    @Test
    void subtreeIncludesEveryLevelBelowAndSurvivesCycles() {
        assertThat(TaxonomyRules.subtree("south-indian", TERMS)).containsExactlyInAnyOrder("south-indian", "karnataka", "hyderabadi", "udupi", "old-style");
        assertThat(TaxonomyRules.subtree("udupi", TERMS)).containsExactly("udupi");
        List<AdminTerm> loop = List.of(term("a", Kind.CUISINE, "b", "A", 0, Status.ACTIVE), term("b", Kind.CUISINE, "a", "B", 0, Status.ACTIVE));
        assertThat(TaxonomyRules.subtree("a", loop)).containsExactly("a", "b");
    }

    @Test
    void aCuisineCannotSitUnderItselfOrItsOwnDescendant() {
        Map<String, AdminTerm> byCode = byCode(TERMS);
        assertThat(TaxonomyRules.createsCycle("karnataka", "karnataka", byCode)).isTrue();
        assertThat(TaxonomyRules.createsCycle("south-indian", "udupi", byCode)).isTrue();
        assertThat(TaxonomyRules.createsCycle("udupi", "north-indian", byCode)).isFalse();
        assertThat(TaxonomyRules.createsCycle("udupi", null, byCode)).isFalse();
    }

    @Test
    void labelsMustBeLiveTermsOfTheRightKind() {
        assertThat(TaxonomyRules.unknown(List.of("udupi", "jain", "old-style", "nowhere"), List.of("jain", "udupi"), byCode(TERMS)))
                .containsExactly("jain", "old-style", "nowhere", "udupi");
    }
}
