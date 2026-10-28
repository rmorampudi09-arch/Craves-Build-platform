package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import in.craves.integration.fleet.dispatch.FleetDispatcher.Candidate;
import in.craves.integration.fleet.eta.EtaModel;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Phase 5, ranked by travel time (FleetDispatcher.byEta; the fleet engine's Rules.rank does the same): the riders nearest by
 * straight line are put in order of the model's minutes to the kitchen, as metres at 20 km/h so a fair band keeps its unit;
 * past the first EtaModel.RANKED, riders follow nearest first, outside any band.
 */
class FleetEtaRankingTest {
    static final EtaModel MODEL = EtaModel.parse(FleetDispatchFixtures.ETA_MODEL); // 2 minutes from the south, 9 from the north
    static final long AT = 1_793_000_000_000L;

    static Candidate rider(int n, double lat, double straightLineM) {
        return new Candidate(new UUID(0, n), straightLineM, lat, KITCHEN_LNG, straightLineM, null, null);
    }

    @Test
    void theRiderSoonestAtTheKitchenComesFirstThoughFarther() {
        List<Candidate> ranked = FleetDispatcher.byEta(List.of(rider(1, KITCHEN_LAT + 0.001, 111), rider(2, KITCHEN_LAT - 0.004, 445)),
            MODEL, KITCHEN_LAT, KITCHEN_LNG, AT);
        assertThat(ranked).extracting(Candidate::riderId).containsExactly(new UUID(0, 2), new UUID(0, 1));
        assertThat(ranked.get(0).rankM()).isCloseTo(2 * EtaModel.METRES_PER_MINUTE, within(1e-9));
        assertThat(ranked.get(1).rankM()).isCloseTo(9 * EtaModel.METRES_PER_MINUTE, within(1e-9));
        assertThat(ranked.get(0).straightLineM()).as("pay still uses the straight line").isEqualTo(445);
    }

    @Test
    void ridersPastTheFirstRankedFollowNearestFirstOutsideAnyBand() {
        List<Candidate> nearestFirst = new ArrayList<>();
        for (int i = 0; i < EtaModel.RANKED; i++) {
            nearestFirst.add(rider(i, KITCHEN_LAT + 0.001, 100 + i)); // 9 minutes each
        }
        nearestFirst.add(rider(100, KITCHEN_LAT - 0.004, 445)); // 2 minutes, but past the first RANKED by straight line
        nearestFirst.add(rider(101, KITCHEN_LAT - 0.005, 556));
        List<Candidate> ranked = FleetDispatcher.byEta(nearestFirst, MODEL, KITCHEN_LAT, KITCHEN_LNG, AT);
        assertThat(ranked.subList(0, EtaModel.RANKED)).allSatisfy(r -> assertThat(Double.isFinite(r.rankM())).isTrue());
        assertThat(ranked.subList(EtaModel.RANKED, ranked.size())).extracting(Candidate::riderId)
            .as("unranked, nearest first").containsExactly(new UUID(0, 100), new UUID(0, 101));
        assertThat(Double.isInfinite(ranked.get(EtaModel.RANKED).rankM())).isTrue();
    }
}
