package in.craves.advanced.personalized;

import in.craves.advanced.personalized.PersonalizedDtos.RankCandidate;
import in.craves.advanced.personalized.PersonalizedDtos.RankReason;
import in.craves.advanced.personalized.PersonalizedDtos.RankResult;
import in.craves.advanced.personalized.PersonalizedDtos.RankedDish;
import in.craves.advanced.platform.clients.SavedFeedGateway.History;
import in.craves.advanced.platform.clients.SavedFeedGateway.PastOrder;
import in.craves.advanced.platform.clients.SavedFeedGateway.PastOrderItem;
import in.craves.advanced.platform.clients.SavedFeedGateway.SavedItem;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Plain, explainable points (not a model): saved dish 4, ordered dish 2 plus 1 per delivered order containing it (up to 3),
 * saved kitchen 2, ordered-from kitchen 1. Higher first; ties keep the order the app sent, so discovery's own order is the base.
 */
final class PersonalizedRules {
    private PersonalizedRules() { }

    static RankResult unchanged(List<RankCandidate> items) {
        return new RankResult(false, distinct(items).stream().map(c -> new RankedDish(c.menuItemId(), c.kitchenId(), 0, List.of())).toList());
    }

    static RankResult rank(List<RankCandidate> items, List<SavedItem> savedDishes, List<SavedItem> savedKitchens, History history) {
        Set<UUID> dishes = new HashSet<>();
        savedDishes.forEach(d -> dishes.add(d.id()));
        Set<UUID> kitchens = new HashSet<>();
        savedKitchens.forEach(k -> kitchens.add(k.id()));
        Map<UUID, Integer> ordered = new HashMap<>();
        Set<UUID> orderedKitchens = new HashSet<>();
        for (PastOrder order : history.orders()) {
            if (order.kitchenId() != null) orderedKitchens.add(order.kitchenId());
            order.items().stream().map(PastOrderItem::menuItemId).distinct().forEach(id -> ordered.merge(id, 1, Integer::sum));
        }
        List<RankedDish> ranked = new ArrayList<>();
        for (RankCandidate c : distinct(items)) {
            List<RankReason> reasons = new ArrayList<>();
            int score = 0;
            if (dishes.contains(c.menuItemId())) { score += 4; reasons.add(RankReason.SAVED_DISH); }
            if (ordered.containsKey(c.menuItemId())) { score += 2 + Math.min(3, ordered.get(c.menuItemId())); reasons.add(RankReason.ORDERED_DISH); }
            if (c.kitchenId() != null && kitchens.contains(c.kitchenId())) { score += 2; reasons.add(RankReason.SAVED_KITCHEN); }
            if (c.kitchenId() != null && orderedKitchens.contains(c.kitchenId())) { score += 1; reasons.add(RankReason.ORDERED_KITCHEN); }
            ranked.add(new RankedDish(c.menuItemId(), c.kitchenId(), score, List.copyOf(reasons)));
        }
        ranked.sort(Comparator.comparingInt(RankedDish::score).reversed()); // List.sort is stable: ties keep the sent order
        return new RankResult(true, List.copyOf(ranked));
    }

    /** The first occurrence of each dish wins. */
    private static List<RankCandidate> distinct(List<RankCandidate> items) {
        Map<UUID, RankCandidate> seen = new LinkedHashMap<>();
        items.forEach(c -> seen.putIfAbsent(c.menuItemId(), c));
        return List.copyOf(seen.values());
    }
}
