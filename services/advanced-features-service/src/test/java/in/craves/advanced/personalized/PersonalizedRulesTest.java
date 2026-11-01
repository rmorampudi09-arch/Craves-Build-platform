package in.craves.advanced.personalized;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.advanced.personalized.PersonalizedDtos.RankCandidate;
import in.craves.advanced.personalized.PersonalizedDtos.RankReason;
import in.craves.advanced.personalized.PersonalizedDtos.RankResult;
import in.craves.advanced.platform.clients.SavedFeedGateway.History;
import in.craves.advanced.platform.clients.SavedFeedGateway.PastOrder;
import in.craves.advanced.platform.clients.SavedFeedGateway.PastOrderItem;
import in.craves.advanced.platform.clients.SavedFeedGateway.SavedItem;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PersonalizedRulesTest {
    static final UUID K1 = UUID.randomUUID();
    static final UUID K2 = UUID.randomUUID();

    @Test
    void savedAndOrderedDishesRiseWhileTiesKeepTheSentOrder() {
        UUID plain1 = UUID.randomUUID(), plain2 = UUID.randomUUID(), saved = UUID.randomUUID(), ordered = UUID.randomUUID(), fromKitchen = UUID.randomUUID();
        History history = new History(List.of(
                new PastOrder(UUID.randomUUID(), K2, "B", Instant.EPOCH, 2, List.of(new PastOrderItem(ordered, "x", 1), new PastOrderItem(ordered, "x", 1))),
                new PastOrder(UUID.randomUUID(), K2, "B", Instant.EPOCH, 2, List.of(new PastOrderItem(ordered, "x", 3)))), true);
        RankResult result = PersonalizedRules.rank(List.of(new RankCandidate(plain1, null), new RankCandidate(fromKitchen, K2),
                        new RankCandidate(saved, K1), new RankCandidate(plain2, null), new RankCandidate(ordered, K2), new RankCandidate(plain1, null)),
                List.of(new SavedItem(saved, null)), List.of(), history);
        assertThat(result.personalized()).isTrue();
        // ordered: 2 + 2 orders + kitchen 1 = 5; saved: 4; fromKitchen: 1; plain ones 0 in sent order; the duplicate is dropped.
        assertThat(result.items()).extracting(d -> d.menuItemId()).containsExactly(ordered, saved, fromKitchen, plain1, plain2);
        assertThat(result.items().get(0).score()).isEqualTo(5);
        assertThat(result.items().get(0).reasons()).containsExactly(RankReason.ORDERED_DISH, RankReason.ORDERED_KITCHEN);
    }

    @Test
    void withoutSignalsNothingMoves() {
        UUID a = UUID.randomUUID(), b = UUID.randomUUID();
        RankResult unchanged = PersonalizedRules.unchanged(List.of(new RankCandidate(b, null), new RankCandidate(a, K1)));
        assertThat(unchanged.personalized()).isFalse();
        assertThat(unchanged.items()).extracting(d -> d.menuItemId()).containsExactly(b, a);
    }
}
