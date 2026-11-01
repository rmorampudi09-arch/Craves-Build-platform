package in.craves.advanced.savedfeed;

import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.clients.SavedFeedGateway.History;
import in.craves.advanced.platform.clients.SavedFeedGateway.KitchenState;
import in.craves.advanced.platform.clients.SavedFeedGateway.PastOrder;
import in.craves.advanced.platform.clients.SavedFeedGateway.PastOrderItem;
import in.craves.advanced.platform.clients.SavedFeedGateway.SavedItem;
import in.craves.advanced.savedfeed.SavedFeedDtos.SavedDishAlternative;
import in.craves.advanced.savedfeed.SavedFeedDtos.SavedDishCard;
import in.craves.advanced.savedfeed.SavedFeedDtos.SavedDishFamiliarity;
import in.craves.advanced.savedfeed.SavedFeedDtos.SavedDishRecovery;
import in.craves.advanced.savedfeed.SavedFeedDtos.SavedFeedView;
import in.craves.advanced.savedfeed.SavedFeedDtos.SavedKitchenCard;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

final class SavedFeedRules {
    static final int ALTERNATIVES = 3;
    static final int REGULARS = 10;
    private static final Comparator<Instant> NEWEST_FIRST = Comparator.nullsLast(Comparator.reverseOrder());

    private SavedFeedRules() { }

    record Inputs(List<SavedItem> dishes, List<SavedItem> kitchens, History history, Map<UUID, MenuItem> buyable,
                  Map<UUID, SavedFeedRepository.SeenDish> seen) { }

    private record KitchenHistory(String name, int delivered, Instant last) { }

    /** Kitchens of saved dishes: Catalog's for available ones, the last seen or ordered kitchen for the others. */
    static Set<UUID> dishKitchens(Inputs in) {
        Map<UUID, UUID> ordered = orderedDishKitchens(in.history());
        Set<UUID> out = new LinkedHashSet<>();
        for (SavedItem dish : in.dishes()) {
            UUID kitchen = kitchenOf(dish.id(), in, ordered);
            if (kitchen != null) out.add(kitchen);
        }
        return out;
    }

    /** Kitchens the caller ordered from but did not save, most delivered orders first. */
    static List<UUID> regularKitchens(Inputs in) {
        Set<UUID> saved = new HashSet<>();
        in.kitchens().forEach(k -> saved.add(k.id()));
        return kitchenHistory(in.history()).entrySet().stream().filter(e -> !saved.contains(e.getKey()))
                .sorted(Comparator.<Map.Entry<UUID, KitchenHistory>>comparingInt(e -> e.getValue().delivered()).reversed()
                        .thenComparing(e -> e.getValue().last(), NEWEST_FIRST).thenComparing(e -> e.getKey().toString()))
                .limit(REGULARS).map(Map.Entry::getKey).toList();
    }

    static SavedFeedView assemble(Inputs in, Map<UUID, KitchenState> states, Instant now) {
        Map<UUID, UUID> ordered = orderedDishKitchens(in.history());
        Map<UUID, int[]> times = new HashMap<>();
        Map<UUID, Instant> lastDish = new HashMap<>();
        Map<UUID, String> orderedNames = new HashMap<>();
        for (PastOrder order : in.history().orders()) {
            Set<UUID> inOrder = new HashSet<>();
            for (PastOrderItem item : order.items()) {
                orderedNames.putIfAbsent(item.menuItemId(), item.name());
                if (inOrder.add(item.menuItemId())) times.computeIfAbsent(item.menuItemId(), id -> new int[1])[0]++;
                lastDish.merge(item.menuItemId(), order.orderedAt() == null ? Instant.MIN : order.orderedAt(), (a, b) -> a.isAfter(b) ? a : b);
            }
        }
        Map<UUID, KitchenHistory> kitchenHistory = kitchenHistory(in.history());

        List<SavedDishCard> dishes = in.dishes().stream().map(saved -> {
            UUID id = saved.id();
            int count = times.containsKey(id) ? times.get(id)[0] : 0;
            Instant last = lastDish.get(id) == Instant.MIN ? null : lastDish.get(id);
            SavedDishFamiliarity familiarity = new SavedDishFamiliarity(count, last);
            MenuItem item = in.buyable().get(id);
            if (item != null) return new SavedDishCard(id, saved.savedAt(), true, item.name(), item.pricePaise(), item.kitchenId(), familiarity, null);
            UUID kitchen = kitchenOf(id, in, ordered);
            SavedFeedRepository.SeenDish seenDish = in.seen().get(id);
            String name = seenDish != null && seenDish.name() != null ? seenDish.name() : orderedNames.get(id);
            KitchenState state = kitchen == null ? null : states.get(kitchen);
            SavedDishRecovery recovery = state == null
                    ? new SavedDishRecovery(kitchen, kitchen == null ? null : nameOf(kitchen, kitchenHistory), "UNKNOWN", null, List.of())
                    : new SavedDishRecovery(kitchen, state.name() != null ? state.name() : nameOf(kitchen, kitchenHistory), state.cookingState(),
                    state.nextAvailabilityAt(), state.preview().stream().filter(d -> !d.menuItemId().equals(id)).limit(ALTERNATIVES)
                    .map(d -> new SavedDishAlternative(d.menuItemId(), d.name(), d.pricePaise())).toList());
            return new SavedDishCard(id, saved.savedAt(), false, name, null, kitchen, familiarity, recovery);
        }).sorted(Comparator.comparing((SavedDishCard c) -> !c.available()).thenComparing(SavedDishCard::savedAt, NEWEST_FIRST)
                .thenComparing(c -> c.menuItemId().toString())).toList();

        List<SavedKitchenCard> kitchens = in.kitchens().stream().map(k -> kitchenCard(k.id(), k.savedAt(), states, kitchenHistory)).toList();
        List<SavedKitchenCard> regulars = regularKitchens(in).stream().map(id -> kitchenCard(id, null, states, kitchenHistory)).toList();
        return new SavedFeedView(now, dishes, kitchens, regulars, in.history().complete());
    }

    private static SavedKitchenCard kitchenCard(UUID id, Instant savedAt, Map<UUID, KitchenState> states, Map<UUID, KitchenHistory> history) {
        KitchenState state = states.get(id);
        KitchenHistory past = history.get(id);
        int delivered = past == null ? 0 : past.delivered();
        Instant last = past == null ? null : past.last();
        // Not resolved (Catalog asked for too many kitchens): exists stays true; only Catalog's own MISSING answer means gone.
        if (state == null) return new SavedKitchenCard(id, savedAt, true, nameOf(id, history), "UNKNOWN", null, false, 0, delivered, last);
        return new SavedKitchenCard(id, savedAt, state.exists(), state.name() != null ? state.name() : nameOf(id, history),
                state.cookingState() == null ? "UNKNOWN" : state.cookingState(), state.nextAvailabilityAt(), state.acceptingOrders(),
                state.availableDishCount(), delivered, last);
    }

    private static UUID kitchenOf(UUID dish, Inputs in, Map<UUID, UUID> ordered) {
        MenuItem item = in.buyable().get(dish);
        if (item != null && item.kitchenId() != null) return item.kitchenId();
        SavedFeedRepository.SeenDish seen = in.seen().get(dish);
        return seen != null ? seen.kitchenId() : ordered.get(dish);
    }

    /** Newest order first, so a dish's kitchen is the one it was last ordered from. */
    private static Map<UUID, UUID> orderedDishKitchens(History history) {
        Map<UUID, UUID> out = new HashMap<>();
        history.orders().stream().sorted(Comparator.comparing(PastOrder::orderedAt, NEWEST_FIRST))
                .forEach(order -> order.items().forEach(item -> { if (order.kitchenId() != null) out.putIfAbsent(item.menuItemId(), order.kitchenId()); }));
        return out;
    }

    private static Map<UUID, KitchenHistory> kitchenHistory(History history) {
        Map<UUID, KitchenHistory> out = new HashMap<>();
        for (PastOrder order : history.orders()) {
            if (order.kitchenId() == null) continue;
            out.merge(order.kitchenId(), new KitchenHistory(order.kitchenName(), Math.max(1, order.completedOrdersFromKitchen()), order.orderedAt()),
                    (a, b) -> new KitchenHistory(a.name() != null ? a.name() : b.name(), Math.max(a.delivered(), b.delivered()),
                            a.last() == null ? b.last() : b.last() == null ? a.last() : (a.last().isAfter(b.last()) ? a.last() : b.last())));
        }
        return out;
    }

    private static String nameOf(UUID kitchen, Map<UUID, KitchenHistory> history) {
        KitchenHistory past = history.get(kitchen);
        return past == null ? null : past.name();
    }
}
