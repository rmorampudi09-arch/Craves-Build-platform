package in.craves.advanced.foodlists;

import in.craves.advanced.foodlists.FoodListDtos.CreateFoodList;
import in.craves.advanced.foodlists.FoodListDtos.FoodListDetail;
import in.craves.advanced.foodlists.FoodListDtos.FoodListItem;
import in.craves.advanced.foodlists.FoodListDtos.FoodListSummary;
import in.craves.advanced.foodlists.FoodListDtos.ShareInfo;
import in.craves.advanced.foodlists.FoodListDtos.ShareLink;
import in.craves.advanced.foodlists.FoodListDtos.SharedFoodList;
import in.craves.advanced.foodlists.FoodListDtos.UpdateFoodList;
import in.craves.advanced.foodlists.FoodListRepository.ItemRow;
import in.craves.advanced.foodlists.FoodListRepository.Row;
import in.craves.advanced.foodlists.FoodListRepository.ShareRow;
import in.craves.advanced.platform.AdvancedSettings;
import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.data.Idempotency;
import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.web.ApiProblem;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FoodListService implements PersonalDataContributor {
    static final int MAX_LISTS = 50;
    static final int MAX_ITEMS = 200;
    static final int MAX_SHARE_DAYS = 365;
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");
    private final SecureRandom random = new SecureRandom();
    private final FoodListRepository lists;
    private final CatalogGateway catalog;
    private final Audit audit;
    private final AdvancedSettings settings;
    private final Clock clock;

    public FoodListService(FoodListRepository lists, CatalogGateway catalog, Audit audit, AdvancedSettings settings, Clock clock) {
        this.lists = lists;
        this.catalog = catalog;
        this.audit = audit;
        this.settings = settings;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<FoodListSummary> myLists(UUID owner) {
        return lists.summaries(owner);
    }

    @Transactional
    public FoodListDetail create(UUID owner, CreateFoodList request) {
        lists.lockOwner(owner);
        if (lists.countByOwner(owner) >= MAX_LISTS) {
            throw ApiProblem.conflict("LIST_LIMIT_REACHED", "You can keep up to " + MAX_LISTS + " lists");
        }
        String name = clean(request.name());
        if (lists.nameTaken(owner, name, null)) throw ApiProblem.conflict("LIST_NAME_TAKEN", "You already have a list with this name");
        Instant now = clock.instant();
        Row row = new Row(UUID.randomUUID(), owner, name, blankToNull(request.description()), 0, 0, now, now);
        lists.insert(row);
        return detail(row, List.of(), Optional.empty());
    }

    @Transactional(readOnly = true)
    public FoodListDetail get(UUID owner, UUID listId) {
        Row row = owned(owner, listId, false);
        return detail(row, lists.items(listId), lists.activeShare(listId));
    }

    @Transactional
    public FoodListDetail update(UUID owner, UUID listId, UpdateFoodList request, Long expectedVersion) {
        Row row = owned(owner, listId, true);
        checkVersion(row, expectedVersion);
        String name = request.name() == null ? row.name() : clean(request.name());
        if (!name.equalsIgnoreCase(row.name()) && lists.nameTaken(owner, name, listId)) {
            throw ApiProblem.conflict("LIST_NAME_TAKEN", "You already have a list with this name");
        }
        String description = request.description() == null ? row.description() : blankToNull(request.description());
        lists.update(listId, name, description, row.itemCount(), clock.instant());
        return get(owner, listId);
    }

    @Transactional
    public void delete(UUID owner, UUID listId) {
        owned(owner, listId, true);
        lists.delete(listId);
        audit.record(FoodListsModule.ID, owner, "LIST_DELETED", "food_list", listId, Map.of());
    }

    @Transactional
    public FoodListDetail putItem(UUID owner, UUID listId, UUID menuItemId, String note) {
        Row row = owned(owner, listId, true);
        String cleanNote = blankToNull(note);
        if (lists.hasItem(listId, menuItemId)) {
            lists.updateItemNote(listId, menuItemId, cleanNote);
            lists.update(listId, row.name(), row.description(), row.itemCount(), clock.instant());
            return get(owner, listId);
        }
        if (row.itemCount() >= MAX_ITEMS) throw ApiProblem.conflict("LIST_FULL", "A list holds up to " + MAX_ITEMS + " dishes");
        MenuItem item = catalog.menuItem(menuItemId)
                .orElseThrow(() -> ApiProblem.notFound("MENU_ITEM_NOT_FOUND", "This dish does not exist"));
        lists.insertItem(listId, menuItemId, cleanNote, item.name(), item.kitchenId(), clock.instant());
        lists.update(listId, row.name(), row.description(), row.itemCount() + 1, clock.instant());
        return get(owner, listId);
    }

    @Transactional
    public FoodListDetail removeItem(UUID owner, UUID listId, UUID menuItemId) {
        Row row = owned(owner, listId, true);
        if (!lists.deleteItem(listId, menuItemId)) throw ApiProblem.notFound("LIST_ITEM_NOT_FOUND", "This dish is not in the list");
        lists.update(listId, row.name(), row.description(), Math.max(0, row.itemCount() - 1), clock.instant());
        return get(owner, listId);
    }

    @Transactional
    public FoodListDetail reorder(UUID owner, UUID listId, List<UUID> order, Long expectedVersion) {
        Row row = owned(owner, listId, true);
        checkVersion(row, expectedVersion);
        Set<UUID> current = new HashSet<>();
        lists.items(listId).forEach(item -> current.add(item.menuItemId()));
        if (order.size() != current.size() || !current.equals(new HashSet<>(order))) {
            throw ApiProblem.unprocessable("REORDER_MISMATCH", "Send every dish in the list exactly once");
        }
        for (int i = 0; i < order.size(); i++) lists.setPosition(listId, order.get(i), i + 1);
        lists.update(listId, row.name(), row.description(), row.itemCount(), clock.instant());
        return get(owner, listId);
    }

    @Transactional
    public ShareLink share(UUID owner, UUID listId, Integer expiresInDays) {
        owned(owner, listId, true);
        if (expiresInDays != null && (expiresInDays < 1 || expiresInDays > MAX_SHARE_DAYS)) {
            throw ApiProblem.badRequest("INVALID_EXPIRY", "expiresInDays must be between 1 and " + MAX_SHARE_DAYS);
        }
        Instant now = clock.instant();
        int revoked = lists.revokeShares(listId, now);
        byte[] secret = new byte[32];
        random.nextBytes(secret);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
        Instant expiresAt = expiresInDays == null ? null : now.plus(Duration.ofDays(expiresInDays));
        lists.insertShare(UUID.randomUUID(), listId, Idempotency.sha256(token), owner, now, expiresAt);
        audit.record(FoodListsModule.ID, owner, revoked > 0 ? "SHARE_ROTATED" : "SHARE_CREATED", "food_list", listId,
                expiresAt == null ? Map.of() : Map.of("expiresAt", expiresAt.toString()));
        return new ShareLink(settings.publicWebOrigin() + "/l/" + token, token, now, expiresAt);
    }

    @Transactional
    public void revokeShare(UUID owner, UUID listId) {
        owned(owner, listId, true);
        if (lists.revokeShares(listId, clock.instant()) == 0) throw ApiProblem.notFound("SHARE_NOT_FOUND", "This list is not shared");
        audit.record(FoodListsModule.ID, owner, "SHARE_REVOKED", "food_list", listId, Map.of());
    }

    @Transactional
    public SharedFoodList viewShared(String token) {
        Row row = sharedList(token, true);
        List<FoodListItem> items = resolve(lists.items(row.id()));
        return new SharedFoodList(row.name(), row.description(), row.itemCount(), items);
    }

    @Transactional
    public FoodListDetail copyShared(UUID caller, String token) {
        Row source = sharedList(token, false);
        if (source.ownerId().equals(caller)) throw ApiProblem.conflict("OWN_LIST", "This is already your list");
        lists.lockOwner(caller);
        if (lists.countByOwner(caller) >= MAX_LISTS) throw ApiProblem.conflict("LIST_LIMIT_REACHED", "You can keep up to " + MAX_LISTS + " lists");
        String name = source.name();
        for (int n = 1; lists.nameTaken(caller, name, null); n++) {
            String suffix = n == 1 ? " (copy)" : " (copy " + n + ")";
            name = source.name().substring(0, Math.min(source.name().length(), 60 - suffix.length())) + suffix;
        }
        Instant now = clock.instant();
        Row copy = new Row(UUID.randomUUID(), caller, name, source.description(), 0, 0, now, now);
        lists.insert(copy);
        List<ItemRow> items = lists.items(source.id());
        for (ItemRow item : items) lists.insertItem(copy.id(), item.menuItemId(), null, item.itemName(), item.kitchenId(), now);
        lists.update(copy.id(), copy.name(), copy.description(), items.size(), now);
        return get(caller, copy.id());
    }

    @Override
    public String moduleId() {
        return FoodListsModule.ID;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> export(UUID person) {
        List<Map<String, Object>> exported = new ArrayList<>();
        for (UUID id : lists.listIdsOf(person)) {
            Row row = lists.find(id, false).orElseThrow();
            List<Map<String, Object>> items = new ArrayList<>();
            for (ItemRow item : lists.items(id)) {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("menuItemId", item.menuItemId());
                entry.put("itemName", item.itemName());
                entry.put("note", item.note());
                entry.put("addedAt", item.addedAt());
                items.add(entry);
            }
            Map<String, Object> list = new LinkedHashMap<>();
            list.put("name", row.name());
            list.put("description", row.description());
            list.put("createdAt", row.createdAt());
            list.put("shared", lists.activeShare(id).isPresent());
            list.put("items", items);
            exported.add(list);
        }
        return Map.of("foodLists", exported);
    }

    @Override
    @Transactional
    public int erase(UUID person) {
        return lists.deleteAllOf(person);
    }

    private Row sharedList(String token, boolean countView) {
        if (token == null || !TOKEN.matcher(token).matches()) throw notShared();
        ShareRow share = lists.shareByTokenHash(Idempotency.sha256(token)).orElseThrow(FoodListService::notShared);
        Instant now = clock.instant();
        if (share.revokedAt() != null || (share.expiresAt() != null && !share.expiresAt().isAfter(now))) throw notShared();
        if (countView) lists.countView(share.id());
        return lists.find(share.listId(), false).orElseThrow(FoodListService::notShared);
    }

    private static ApiProblem notShared() {
        return ApiProblem.notFound("SHARED_LIST_NOT_FOUND", "This link has expired or was turned off");
    }

    private Row owned(UUID owner, UUID listId, boolean forUpdate) {
        Row row = lists.find(listId, forUpdate).orElseThrow(() -> ApiProblem.notFound("LIST_NOT_FOUND", "List not found"));
        if (!row.ownerId().equals(owner)) throw ApiProblem.notFound("LIST_NOT_FOUND", "List not found");
        return row;
    }

    private static void checkVersion(Row row, Long expectedVersion) {
        if (expectedVersion != null && expectedVersion != row.version()) {
            throw new ApiProblem(412, "VERSION_MISMATCH", "The list changed since you loaded it; reload and try again");
        }
    }

    private FoodListDetail detail(Row row, List<ItemRow> items, Optional<ShareRow> share) {
        Instant now = clock.instant();
        Optional<ShareRow> live = share.filter(s -> s.expiresAt() == null || s.expiresAt().isAfter(now));
        return new FoodListDetail(row.id(), row.name(), row.description(), items.size(), live.isPresent() ? "SHARED" : "PRIVATE",
                row.version(), row.createdAt(), row.updatedAt(),
                live.map(s -> new ShareInfo(s.createdAt(), s.expiresAt(), s.viewCount())).orElse(null), resolve(items));
    }

    /** Current availability and price from Catalog; never fails the read when Catalog is down. */
    private List<FoodListItem> resolve(List<ItemRow> items) {
        Map<UUID, MenuItem> live;
        boolean known = true;
        try {
            live = items.isEmpty() ? Map.of() : catalog.purchasable(items.stream().map(ItemRow::menuItemId).toList());
        } catch (ApiProblem unavailable) {
            live = Map.of();
            known = false;
        }
        List<FoodListItem> result = new ArrayList<>(items.size());
        for (ItemRow item : items) {
            MenuItem current = live.get(item.menuItemId());
            String availability = !known ? "UNKNOWN" : current != null ? "AVAILABLE" : "UNAVAILABLE";
            result.add(new FoodListItem(item.menuItemId(), current != null && current.name() != null ? current.name() : item.itemName(),
                    current != null && current.kitchenId() != null ? current.kitchenId() : item.kitchenId(), item.note(), item.position(),
                    item.addedAt(), availability, current == null ? null : current.pricePaise()));
        }
        return result;
    }

    private static String clean(String value) {
        String trimmed = value == null ? "" : value.strip().replaceAll("\\s+", " ");
        if (trimmed.isEmpty()) throw ApiProblem.badRequest("NAME_REQUIRED", "Give the list a name");
        return trimmed;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
