package in.craves.integration.admin.deliveryintelligence;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class DeliveryIntelligenceHistoryTest {
    @Test void returnsBoundedPagesAndKeepsFullHistoricalWindow() {
        var from = OffsetDateTime.parse("2023-01-01T00:00:00Z");
        var to = OffsetDateTime.parse("2024-01-01T00:00:00Z");
        List<String> queries = new ArrayList<>();
        JdbcTemplate jdbc = mock(JdbcTemplate.class, invocation -> {
            if (!invocation.getMethod().getName().equals("query")) return RETURNS_DEFAULTS.answer(invocation);
            String sql = invocation.getArgument(0);
            queries.add(sql);
            Object[] args = invocation.getArguments();
            assertThat(args).contains(from, to);
            if (sql.contains(") recent")) {
                assertThat(args[args.length - 2]).isEqualTo(6);
                assertThat(args[args.length - 1]).isEqualTo(10);
                return IntStream.range(0, 6).mapToObj(i -> new ActivityItem("a" + i, null, null, null, "STATUS_EVENT", "DELIVERED", "", from, false)).toList();
            }
            if (sql.contains(") attention")) {
                assertThat(args[args.length - 1]).isEqualTo(5);
                return List.of(new AttentionItem("b", null, null, "COMMAND_RECOVERY", "FAILED", from, true));
            }
            return List.of();
        });
        var result = new DeliveryIntelligenceReadRepository(jdbc).overview(0, 5, from, to, 10, 5, "asc");
        assertThat(result.recentActivity()).hasSize(5);
        assertThat(result.activityHasMore()).isTrue();
        assertThat(result.attentionHasMore()).isFalse();
        assertThat(result.activityOffset()).isEqualTo(10);
        assertThat(result.windowStart()).isEqualTo(from);
        assertThat(result.bucketUnit()).isEqualTo("week");
        assertThat(queries).anyMatch(sql -> sql.contains("ORDER BY occurred_at ASC, activity_type ASC, activity_id ASC"));
    }
}
