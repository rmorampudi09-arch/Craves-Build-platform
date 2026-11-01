package in.craves.advanced.savedfeed;

import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.clients.SavedFeedGateway;
import in.craves.advanced.platform.clients.SavedFeedGateway.History;
import in.craves.advanced.platform.clients.SavedFeedGateway.KitchenState;
import in.craves.advanced.platform.clients.SavedFeedGateway.SavedItem;
import in.craves.advanced.savedfeed.SavedFeedDtos.SavedFeedView;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

/**
 * Nothing personal is stored: favorites stay in User-chef service and history in Order service. No transaction is open while
 * other services answer; the one small write is best-effort and never fails the read.
 */
@Service
public class SavedFeedService {
    /** Catalog resolves at most 100 kitchens per call. */
    static final int MAX_KITCHENS = 100;
    private final SavedFeedGateway sources;
    private final CatalogGateway catalog;
    private final SavedFeedRepository repository;
    private final Clock clock;

    public SavedFeedService(SavedFeedGateway sources, CatalogGateway catalog, SavedFeedRepository repository, Clock clock) {
        this.sources = sources;
        this.catalog = catalog;
        this.repository = repository;
        this.clock = clock;
    }

    public SavedFeedView feed(String token) {
        Instant now = clock.instant();
        List<SavedItem> dishes = sources.favoriteDishes(token);
        List<SavedItem> kitchens = sources.favoriteKitchens(token);
        History history = sources.deliveredOrders(token);
        Map<UUID, MenuItem> buyable = dishes.isEmpty() ? Map.of() : catalog.purchasable(dishes.stream().map(SavedItem::id).toList());
        try {
            repository.remember(buyable.values(), now);
        } catch (DataAccessException ignored) {
            // shortcut: remembering is a cache for recovery; a failed write only means an older name/kitchen is shown later.
        }
        Map<UUID, SavedFeedRepository.SeenDish> seen = repository.seen(dishes.stream().map(SavedItem::id).filter(id -> !buyable.containsKey(id)).toList());

        SavedFeedRules.Inputs inputs = new SavedFeedRules.Inputs(dishes, kitchens, history, buyable, seen);
        Set<UUID> wanted = new LinkedHashSet<>();
        kitchens.forEach(k -> wanted.add(k.id()));
        wanted.addAll(SavedFeedRules.dishKitchens(inputs));
        wanted.addAll(SavedFeedRules.regularKitchens(inputs));
        // shortcut: at most 3 Catalog calls (300 kitchens); kitchens beyond show UNKNOWN. Saved kitchens are capped at 100 upstream.
        List<UUID> ids = wanted.stream().limit(3L * MAX_KITCHENS).toList();
        Map<UUID, KitchenState> states = new HashMap<>();
        for (int from = 0; from < ids.size(); from += MAX_KITCHENS) {
            states.putAll(sources.kitchenStates(ids.subList(from, Math.min(ids.size(), from + MAX_KITCHENS))));
        }
        return SavedFeedRules.assemble(inputs, states, now);
    }
}
