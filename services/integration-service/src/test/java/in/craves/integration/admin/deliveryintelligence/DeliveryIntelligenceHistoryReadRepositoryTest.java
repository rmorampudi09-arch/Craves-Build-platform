package in.craves.integration.admin.deliveryintelligence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.RETURNS_DEFAULTS;
import static org.mockito.Mockito.mock;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;

class DeliveryIntelligenceHistoryReadRepositoryTest {
    @ParameterizedTest
    @ValueSource(strings = {"asc", "desc"})
    void historyQueriesKeepSortKeywordSeparateFromTimestampColumn(String sort) {
        List<String> queries = new ArrayList<>();
        JdbcTemplate jdbc = mock(JdbcTemplate.class, invocation -> {
            if (invocation.getMethod().getName().equals("query")) {
                queries.add(invocation.getArgument(0, String.class));
                return List.of();
            }
            return RETURNS_DEFAULTS.answer(invocation);
        });

        new DeliveryIntelligenceHistoryReadRepository(jdbc)
            .overview(24, 25, sort, 25, 50, null, null);

        String direction = sort.toUpperCase(Locale.ROOT);
        // Exercise the compiled Java text blocks: trailing source whitespace is stripped.
        // Both queries must sort by a real column, not occurred_atASC/occurred_atDESC.
        List<String> paginated = queries.stream().filter(sql -> sql.contains("OFFSET ?")).toList();
        assertThat(paginated).hasSize(2);
        assertThat(paginated.get(0)).contains(
            "ORDER BY occurred_at " + direction + ", activity_id " + direction + "\n LIMIT ? OFFSET ?"
        );
        assertThat(paginated.get(1)).contains(
            "ORDER BY occurred_at " + direction + ", reference_id " + direction + "\n LIMIT ? OFFSET ?"
        );
    }
}
