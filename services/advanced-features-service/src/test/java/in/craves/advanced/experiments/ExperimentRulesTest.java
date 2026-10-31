package in.craves.advanced.experiments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.advanced.experiments.ExperimentDtos.ExperimentVariant;
import in.craves.advanced.platform.web.ApiProblem;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ExperimentRulesTest {
    static final List<ExperimentVariant> EVEN = List.of(new ExperimentVariant("control", 1), new ExperimentVariant("new-card", 1));

    @Test
    void assignmentIsStableAndFollowsTheWeights() {
        UUID salt = UUID.randomUUID();
        UUID person = UUID.randomUUID();
        assertThat(ExperimentRules.assign(salt, person, EVEN)).isEqualTo(ExperimentRules.assign(salt, person, EVEN));
        List<ExperimentVariant> skewed = List.of(new ExperimentVariant("a", 3), new ExperimentVariant("b", 1));
        Map<String, Integer> counts = new HashMap<>();
        for (int i = 0; i < 20000; i++) counts.merge(ExperimentRules.assign(salt, UUID.randomUUID(), skewed), 1, Integer::sum);
        assertThat(counts.get("a")).isBetween(14400, 15600);
        assertThat(counts.get("b")).isBetween(4400, 5600);
    }

    @Test
    void anotherSaltReshufflesPeople() {
        UUID person = UUID.randomUUID();
        long differs = java.util.stream.IntStream.range(0, 200)
                .filter(i -> !ExperimentRules.assign(UUID.randomUUID(), person, EVEN).equals(ExperimentRules.assign(UUID.randomUUID(), person, EVEN)))
                .count();
        assertThat(differs).isBetween(60L, 140L);
    }

    @Test
    void variantsAndPropertiesAreChecked() {
        assertThatThrownBy(() -> ExperimentRules.checkVariants(List.of(new ExperimentVariant("a", 1), new ExperimentVariant("a", 2))))
                .isInstanceOf(ApiProblem.class);
        assertThat(ExperimentRules.validProperties(Map.of("screen", "home", "position", 3, "saved", true))).isTrue();
        assertThat(ExperimentRules.validProperties(null)).isTrue();
        assertThat(ExperimentRules.validProperties(Map.of("nested", Map.of("a", 1)))).isFalse();
        assertThat(ExperimentRules.validProperties(Map.of("text", "x".repeat(101)))).isFalse();
    }

    @Test
    void smallCountsAreHidden() {
        assertThat(ExperimentRules.suppress(4)).isNull();
        assertThat(ExperimentRules.suppress(0)).isNull();
        assertThat(ExperimentRules.suppress(5)).isEqualTo(5L);
    }
}
