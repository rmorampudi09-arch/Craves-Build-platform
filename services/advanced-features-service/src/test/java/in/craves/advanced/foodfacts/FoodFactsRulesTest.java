package in.craves.advanced.foodfacts;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.advanced.foodfacts.FoodFactsDtos.FactsContent;
import in.craves.advanced.foodfacts.FoodFactsDtos.Ingredient;
import in.craves.advanced.foodfacts.FoodFactsDtos.Nutrition;
import in.craves.advanced.foodfacts.FoodFactsDtos.Source;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class FoodFactsRulesTest {
    @Test
    void allergensIncludeEveryIngredientsAndMayContainNeverRepeatsThem() {
        FactsContent content = new FactsContent(List.of(new Ingredient("  Paneer   cubes ", Set.of(Allergen.MILK)),
                new Ingredient("Rice", null)), Set.of(Allergen.MUSTARD), Set.of(Allergen.MILK, Allergen.PEANUTS), null, null,
                Source.CHEF_DECLARED, "  ");
        FactsContent normal = FoodFactsService.normalise(content);
        assertThat(normal.allergens()).containsExactly(Allergen.MILK, Allergen.MUSTARD);
        assertThat(normal.mayContain()).containsExactly(Allergen.PEANUTS);
        assertThat(normal.ingredients().get(0).name()).isEqualTo("Paneer cubes");
        assertThat(normal.evidenceReference()).isNull();
    }

    @Test
    void plausibilityWarnings() {
        Nutrition consistent = new Nutrition(new BigDecimal("520"), new BigDecimal("18"), new BigDecimal("62"), new BigDecimal("6"),
                new BigDecimal("22"), new BigDecimal("9"), new BigDecimal("4"), new BigDecimal("900"));
        FactsContent ok = new FactsContent(List.of(new Ingredient("Rice", Set.of())), Set.of(Allergen.MILK), Set.of(), consistent, 350,
                Source.CHEF_DECLARED, null);
        assertThat(FoodFactsService.warnings(ok)).isEmpty();

        Nutrition off = new Nutrition(new BigDecimal("100"), new BigDecimal("18"), new BigDecimal("62"), new BigDecimal("80"),
                new BigDecimal("2"), new BigDecimal("9"), null, null);
        FactsContent bad = new FactsContent(List.of(new Ingredient("Rice", Set.of())), Set.of(), Set.of(), off, 50, Source.LAB_TESTED, null);
        assertThat(FoodFactsService.warnings(bad)).containsExactly("ENERGY_DOES_NOT_MATCH_MACRONUTRIENTS", "NUTRIENTS_EXCEED_SERVING_SIZE",
                "SUGARS_EXCEED_CARBOHYDRATE", "SATURATED_FAT_EXCEEDS_FAT", "EVIDENCE_REFERENCE_MISSING", "NO_ALLERGENS_DECLARED");
    }
}
