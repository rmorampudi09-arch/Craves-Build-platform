package in.craves.advanced.support;

import in.craves.advanced.platform.clients.MenuSearchGateway;
import in.craves.advanced.platform.web.ApiProblem;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Dishes matched like Catalog's simple text search (every word in name, description or category) plus its filters; records each search. */
public final class FakeMenuSearch implements MenuSearchGateway {
    public final List<FoundDish> dishes = new ArrayList<>();
    public final List<MenuSearch> calls = new ArrayList<>();
    public volatile boolean down;

    public synchronized void reset() {
        dishes.clear();
        calls.clear();
        down = false;
    }

    @Override
    public synchronized List<FoundDish> nearbyDishes(MenuSearch search) {
        calls.add(search);
        if (down) throw ApiProblem.unavailable("CATALOG_UNAVAILABLE", "down");
        return dishes.stream().filter(d -> search.foodType() == null || search.foodType().equals(d.foodType()))
                .filter(d -> search.spiceLevel() == null || search.spiceLevel().equals(d.spiceLevel()))
                .filter(d -> search.category() == null || search.category().equalsIgnoreCase(d.category()))
                .filter(d -> search.text() == null || List.of(search.text().split(" ")).stream().allMatch(word ->
                        (d.itemName() + " " + d.description() + " " + d.category()).toLowerCase(Locale.ROOT).contains(word)))
                .limit(search.size()).toList();
    }
}
