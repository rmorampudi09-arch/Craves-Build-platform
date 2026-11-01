package in.craves.advanced.liveactivities;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.advanced.liveactivities.LiveActivityDtos.LiveOrderStage;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class LiveActivityRulesTest {
    @Test
    void orderStatusesMapToStagesAndFinishedOnesEndTheActivity() {
        assertThat(LiveActivityRules.stage("CHEF_ACCEPTANCE_PENDING")).isEqualTo(LiveOrderStage.PLACED);
        assertThat(LiveActivityRules.stage("READY_FOR_PICKUP")).isEqualTo(LiveOrderStage.READY);
        assertThat(LiveActivityRules.stage("REFUNDED")).isEqualTo(LiveOrderStage.ENDED);
        assertThat(LiveActivityRules.stage("SOMETHING_NEW")).isEqualTo(LiveOrderStage.UNKNOWN);
        assertThat(LiveActivityRules.stage(null)).isEqualTo(LiveOrderStage.UNKNOWN);
        var delivered = LiveActivityRules.state(new Order(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "DELIVERED", List.of(), null,
                Instant.EPOCH, Instant.EPOCH));
        assertThat(delivered.step()).isEqualTo(5);
        assertThat(delivered.isFinal()).isTrue();
        assertThat(LiveActivityRules.state(new Order(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "OUT_FOR_DELIVERY", List.of(), null,
                Instant.EPOCH, Instant.EPOCH)).isFinal()).isFalse();
    }
}
