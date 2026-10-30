package in.craves.advanced.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.data.Money;
import in.craves.advanced.platform.module.FeatureModule;
import in.craves.advanced.platform.web.ApiProblem;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PlatformRulesTest {
    @Test
    void cursorRoundTripsAndRejectsGarbage() {
        Cursor cursor = new Cursor(Instant.parse("2026-10-31T10:15:30.123456Z"), UUID.randomUUID());
        assertThat(Cursor.decode(cursor.encode())).isEqualTo(cursor);
        assertThatThrownBy(() -> Cursor.decode("not-a-cursor")).isInstanceOf(ApiProblem.class);
        assertThat(Cursor.decode(null)).isNull();
    }

    @Test
    void moneyIsExactPaise() {
        assertThat(Money.paise(new BigDecimal("249.50"))).isEqualTo(24950);
        assertThat(Money.paise(new BigDecimal("12"))).isEqualTo(1200);
        assertThatThrownBy(() -> Money.paise(new BigDecimal("1.234"))).isInstanceOf(ArithmeticException.class);
    }

    @Test
    void moduleNamingRules() {
        FeatureModule module = new FeatureModule("food-lists", "adv_food_lists", List.of("/api/v1/food-lists"), List.of(), List.of());
        assertThat(module.flagName()).isEqualTo("CRAVES_ADV_FOOD_LISTS_ENABLED");
        assertThat(module.migrations()).isEqualTo("classpath:db/advanced/food_lists");
        assertThat(module.serves("/api/v1/food-lists/123")).isTrue();
        assertThat(module.serves("/api/v1/food-listsX")).isFalse();
        assertThatThrownBy(() -> new FeatureModule("Bad", "public", List.of(), List.of(), List.of())).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void everyLockedClassExists() throws Exception {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("live-runtime-lock.txt")) {
            List<String> names = new String(in.readAllBytes(), StandardCharsets.UTF_8).lines().map(l -> l.replaceFirst("#.*", "").strip())
                    .filter(l -> !l.isEmpty()).toList();
            assertThat(names).isNotEmpty();
            for (String name : names) assertThat(Class.forName(name)).isNotNull();
        }
    }
}
