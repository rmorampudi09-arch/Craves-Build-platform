package in.craves.advanced.grouporders;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.grouporders.GroupOrderDtos.CheckoutLine;
import in.craves.advanced.grouporders.GroupOrderDtos.CheckoutResult;
import in.craves.advanced.grouporders.GroupOrderDtos.CreateGroupOrder;
import in.craves.advanced.grouporders.GroupOrderDtos.GroupOrderSummary;
import in.craves.advanced.grouporders.GroupOrderDtos.GroupOrderView;
import in.craves.advanced.grouporders.GroupOrderDtos.ItemView;
import in.craves.advanced.grouporders.GroupOrderDtos.ParticipantView;
import in.craves.advanced.grouporders.GroupOrderRepository.Group;
import in.craves.advanced.grouporders.GroupOrderRepository.Item;
import in.craves.advanced.grouporders.GroupOrderRepository.Participant;
import in.craves.advanced.platform.AdvancedSettings;
import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.clients.OrderCartGateway;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.web.ApiProblem;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GroupOrderService implements PersonalDataContributor {
    static final int MAX_ACTIVE_HOSTED = 5;
    static final int MAX_DISTINCT_ITEMS_PER_PERSON = 20;
    static final int MAX_LINE_QUANTITY = 100;
    /** Crockford-style alphabet without 0/O/1/I/L/U: 8 characters = 40 bits, shown as XXXX-XXXX. */
    private static final char[] ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
    private final SecureRandom random = new SecureRandom();
    private final GroupOrderRepository groups;
    private final CatalogGateway catalog;
    private final OrderCartGateway cart;
    private final Audit audit;
    private final AdvancedSettings settings;
    private final ObjectMapper json;
    private final Clock clock;

    public GroupOrderService(GroupOrderRepository groups, CatalogGateway catalog, OrderCartGateway cart, Audit audit,
                             AdvancedSettings settings, ObjectMapper json, Clock clock) {
        this.groups = groups;
        this.catalog = catalog;
        this.cart = cart;
        this.audit = audit;
        this.settings = settings;
        this.json = json;
        this.clock = clock;
    }

    @Transactional
    public GroupOrderView create(UUID host, CreateGroupOrder request) {
        if (groups.activeHostedBy(host) >= MAX_ACTIVE_HOSTED) {
            throw ApiProblem.conflict("TOO_MANY_OPEN_GROUPS", "Finish or cancel one of your open group orders first");
        }
        if (!catalog.kitchenExists(request.kitchenId())) throw ApiProblem.notFound("KITCHEN_NOT_FOUND", "This kitchen does not exist");
        Instant now = clock.instant();
        int window = request.joinWindowMinutes() == null ? 60 : request.joinWindowMinutes();
        int max = request.maxParticipants() == null ? 10 : request.maxParticipants();
        String code = newCode();
        Group group = new Group(UUID.randomUUID(), host, request.kitchenId(), request.title().strip(), code, "OPEN",
                now.plus(Duration.ofMinutes(window)), max, 0, now, now);
        groups.insertGroup(group);
        groups.insertParticipant(group.id(), host, displayName(request.hostDisplayName(), "Host"), "HOST", now);
        audit.record(GroupOrdersModule.ID, host, "GROUP_CREATED", "group_order", group.id(), Map.of("kitchenId", request.kitchenId().toString()));
        return view(group.id(), host);
    }

    @Transactional
    public GroupOrderView join(UUID person, String rawCode, String displayName) {
        String code = rawCode.replace("-", "").toUpperCase();
        Group group = groups.findByCode(code, true).orElseThrow(() -> ApiProblem.notFound("GROUP_NOT_FOUND", "Check the code and try again"));
        var existing = groups.participant(group.id(), person);
        if (existing.isPresent()) {
            if (existing.get().removedAt() != null) throw ApiProblem.forbidden("REMOVED_FROM_GROUP", "The host removed you from this group order");
            return view(group.id(), person);
        }
        group = effective(group);
        if (!"OPEN".equals(group.status())) throw ApiProblem.conflict("GROUP_CLOSED", "This group order is no longer taking people");
        long active = groups.participants(group.id()).stream().filter(p -> p.removedAt() == null).count();
        if (active >= group.maxParticipants()) throw ApiProblem.conflict("GROUP_FULL", "This group order is full");
        Instant now = clock.instant();
        groups.insertParticipant(group.id(), person, displayName(displayName, "Guest " + (active + 1)), "MEMBER", now);
        groups.touch(group.id(), now);
        return view(group.id(), person);
    }

    @Transactional(readOnly = true)
    public List<GroupOrderSummary> mine(UUID person) {
        Instant now = clock.instant();
        return groups.groupsOf(person, 20).stream().map(g -> {
            String status = "OPEN".equals(g.status()) && !g.joinUntil().isAfter(now) ? "LOCKED" : g.status();
            return new GroupOrderSummary(g.id(), g.kitchenId(), g.title(), status, g.joinUntil(), g.hostId().equals(person), g.createdAt());
        }).toList();
    }

    @Transactional(readOnly = true)
    public GroupOrderView get(UUID person, UUID groupId) {
        member(groupId, person);
        return view(groupId, person);
    }

    @Transactional
    public GroupOrderView putMyItem(UUID person, UUID groupId, UUID menuItemId, int quantity, String note) {
        Group group = editable(groupId, person);
        MenuItem item = catalog.purchasable(List.of(menuItemId)).get(menuItemId);
        if (item == null) throw ApiProblem.conflict("ITEM_UNAVAILABLE", "This dish cannot be ordered right now");
        if (!group.kitchenId().equals(item.kitchenId())) {
            throw ApiProblem.unprocessable("ITEM_NOT_FROM_GROUP_KITCHEN", "Add dishes from the group's kitchen only");
        }
        boolean known = groups.items(groupId).stream().anyMatch(i -> i.participantId().equals(person) && i.menuItemId().equals(menuItemId));
        if (!known && groups.distinctItemsOf(groupId, person) >= MAX_DISTINCT_ITEMS_PER_PERSON) {
            throw ApiProblem.conflict("TOO_MANY_ITEMS", "You can add up to " + MAX_DISTINCT_ITEMS_PER_PERSON + " different dishes");
        }
        Instant now = clock.instant();
        groups.upsertItem(groupId, person, menuItemId, quantity, note == null || note.isBlank() ? null : note.strip(),
                item.name() == null ? "Dish" : item.name(), item.pricePaise() == null ? 0 : item.pricePaise(), now);
        groups.touch(groupId, now);
        return view(groupId, person);
    }

    @Transactional
    public GroupOrderView removeMyItem(UUID person, UUID groupId, UUID menuItemId) {
        editable(groupId, person);
        if (!groups.deleteItem(groupId, person, menuItemId)) throw ApiProblem.notFound("ITEM_NOT_FOUND", "This dish is not in your share");
        groups.touch(groupId, clock.instant());
        return view(groupId, person);
    }

    @Transactional
    public GroupOrderView leave(UUID person, UUID groupId) {
        Group group = groups.find(groupId, true).orElseThrow(GroupOrderService::notFound);
        Participant me = member(groupId, person);
        if ("HOST".equals(me.role())) throw ApiProblem.conflict("HOST_CANNOT_LEAVE", "As host, cancel the group order instead");
        if (!Set.of("OPEN", "LOCKED").contains(group.status())) throw ApiProblem.conflict("GROUP_CLOSED", "This group order is closed");
        groups.removeParticipant(groupId, person, clock.instant());
        groups.touch(groupId, clock.instant());
        return null;
    }

    @Transactional
    public GroupOrderView removeParticipant(UUID host, UUID groupId, UUID participantId, Long expectedVersion) {
        Group group = hosted(groupId, host, expectedVersion);
        if (!Set.of("OPEN", "LOCKED").contains(group.status())) throw ApiProblem.conflict("GROUP_CLOSED", "This group order is closed");
        if (participantId.equals(host)) throw ApiProblem.conflict("HOST_CANNOT_LEAVE", "As host, cancel the group order instead");
        Participant target = groups.participant(groupId, participantId).filter(p -> p.removedAt() == null)
                .orElseThrow(() -> ApiProblem.notFound("PARTICIPANT_NOT_FOUND", "This person is not in the group"));
        groups.removeParticipant(groupId, target.participantId(), clock.instant());
        groups.touch(groupId, clock.instant());
        audit.record(GroupOrdersModule.ID, host, "PARTICIPANT_REMOVED", "group_order", groupId, Map.of("participantId", participantId.toString()));
        return view(groupId, host);
    }

    @Transactional
    public GroupOrderView lock(UUID host, UUID groupId, Long expectedVersion) {
        Group group = hosted(groupId, host, expectedVersion);
        if (!"OPEN".equals(group.status())) throw ApiProblem.conflict("GROUP_NOT_OPEN", "Only an open group order can be locked");
        groups.setStatus(groupId, "LOCKED", null, clock.instant());
        return view(groupId, host);
    }

    @Transactional
    public GroupOrderView unlock(UUID host, UUID groupId, Integer joinWindowMinutes, Long expectedVersion) {
        Group group = hosted(groupId, host, expectedVersion);
        if (!"LOCKED".equals(group.status()) && !"OPEN".equals(group.status())) {
            throw ApiProblem.conflict("GROUP_CLOSED", "This group order is closed");
        }
        Instant now = clock.instant();
        Instant until = joinWindowMinutes != null ? now.plus(Duration.ofMinutes(joinWindowMinutes))
                : group.joinUntil().isAfter(now) ? group.joinUntil() : null;
        if (until == null) throw ApiProblem.unprocessable("JOIN_WINDOW_REQUIRED", "The join window has passed; send joinWindowMinutes to reopen");
        groups.setStatus(groupId, "OPEN", until, now);
        return view(groupId, host);
    }

    @Transactional
    public GroupOrderView cancel(UUID host, UUID groupId, Long expectedVersion) {
        Group group = hosted(groupId, host, expectedVersion);
        if ("CANCELLED".equals(group.status())) return view(groupId, host);
        if ("CHECKED_OUT".equals(group.status())) throw ApiProblem.conflict("GROUP_CHECKED_OUT", "This group order was already sent to checkout");
        groups.setStatus(groupId, "CANCELLED", null, clock.instant());
        audit.record(GroupOrdersModule.ID, host, "GROUP_CANCELLED", "group_order", groupId, Map.of());
        return view(groupId, host);
    }

    /** Hands the locked basket to the host: returns the lines, and optionally fills the host's real cart with them. */
    @Transactional
    public CheckoutResult checkout(UUID host, String hostToken, UUID groupId, boolean applyToCart, boolean replaceCart, Long expectedVersion) {
        Group group = groups.find(groupId, true).orElseThrow(GroupOrderService::notFound);
        if (!group.hostId().equals(host)) throw ApiProblem.forbidden("HOST_ONLY", "Only the host can do this");
        if ("CHECKED_OUT".equals(group.status())) return storedCheckout(groupId);
        if (expectedVersion != null && expectedVersion != group.version()) {
            throw new ApiProblem(412, "VERSION_MISMATCH", "The group order changed; reload and try again");
        }
        if (!"LOCKED".equals(effective(group).status())) throw ApiProblem.conflict("LOCK_FIRST", "Lock the group order before checkout");
        Map<UUID, Integer> quantities = new LinkedHashMap<>();
        for (Item item : groups.items(groupId)) quantities.merge(item.menuItemId(), item.quantity(), Integer::sum);
        if (quantities.isEmpty()) throw ApiProblem.unprocessable("GROUP_EMPTY", "Nobody has added a dish yet");
        Map<UUID, MenuItem> live = catalog.purchasable(quantities.keySet());
        List<String> missing = quantities.keySet().stream().filter(id -> !live.containsKey(id)).map(UUID::toString).toList();
        if (!missing.isEmpty()) {
            throw new ApiProblem(409, "ITEMS_UNAVAILABLE", "Some dishes can no longer be ordered; ask people to change them", missing);
        }
        List<CheckoutLine> lines = new ArrayList<>();
        long subtotal = 0;
        for (var entry : quantities.entrySet()) {
            int quantity = entry.getValue();
            if (quantity > MAX_LINE_QUANTITY) throw ApiProblem.unprocessable("LINE_TOO_LARGE", "At most " + MAX_LINE_QUANTITY + " of one dish per order");
            MenuItem item = live.get(entry.getKey());
            long unit = item.pricePaise() == null ? 0 : item.pricePaise();
            lines.add(new CheckoutLine(entry.getKey(), item.name(), quantity, unit, unit * quantity));
            subtotal += unit * quantity;
        }
        if (applyToCart) {
            if (cart.itemCount(hostToken) > 0) {
                if (!replaceCart) throw ApiProblem.conflict("HOST_CART_NOT_EMPTY", "Your cart already has dishes; send replaceCart=true to replace them");
                cart.clear(hostToken);
            }
            for (CheckoutLine line : lines) cart.add(hostToken, line.menuItemId(), line.quantity());
        }
        Instant now = clock.instant();
        try {
            groups.insertCheckout(groupId, host, json.writeValueAsString(lines), subtotal, applyToCart, now);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
        groups.setStatus(groupId, "CHECKED_OUT", null, now);
        audit.record(GroupOrdersModule.ID, host, "GROUP_CHECKED_OUT", "group_order", groupId,
                Map.of("lines", lines.size(), "subtotalPaise", subtotal, "appliedToCart", applyToCart));
        return new CheckoutResult(groupId, lines, subtotal, applyToCart, now);
    }

    @Scheduled(fixedDelayString = "PT6H", initialDelayString = "PT10M")
    @Transactional
    public void purge() {
        try {
            groups.purgeOld();
        } catch (RuntimeException ignored) {
            // Schema not migrated yet or the database is briefly unavailable: the next run retries.
        }
    }

    @Override
    public String moduleId() {
        return GroupOrdersModule.ID;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> export(UUID person) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Group g : groups.groupsOf(person, 200)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("title", g.title());
            row.put("status", g.status());
            row.put("host", g.hostId().equals(person));
            row.put("createdAt", g.createdAt());
            row.put("yourItems", groups.items(g.id()).stream().filter(i -> i.participantId().equals(person))
                    .map(i -> Map.of("itemName", i.itemName(), "quantity", i.quantity())).toList());
            rows.add(row);
        }
        return Map.of("groupOrders", rows);
    }

    @Override
    @Transactional
    public int erase(UUID person) {
        return groups.eraseParticipation(person);
    }

    private CheckoutResult storedCheckout(UUID groupId) {
        String stored = groups.checkoutJson(groupId).orElseThrow(() -> ApiProblem.conflict("GROUP_CHECKED_OUT", "Already sent to checkout"));
        try {
            var node = json.readTree(stored);
            List<CheckoutLine> lines = json.convertValue(node.get("lines"),
                    json.getTypeFactory().constructCollectionType(List.class, CheckoutLine.class));
            return new CheckoutResult(groupId, lines, node.get("subtotalPaise").asLong(), node.get("appliedToCart").asBoolean(),
                    java.time.OffsetDateTime.parse(node.get("createdAt").asText()).toInstant());
        } catch (JsonProcessingException | RuntimeException ex) {
            throw new IllegalStateException("Stored checkout is unreadable", ex);
        }
    }

    private Group editable(UUID groupId, UUID person) {
        Group group = groups.find(groupId, true).orElseThrow(GroupOrderService::notFound);
        member(groupId, person);
        Group current = effective(group);
        if ("LOCKED".equals(current.status())) throw ApiProblem.conflict("GROUP_LOCKED", "The host has locked this group order");
        if (!"OPEN".equals(current.status())) throw ApiProblem.conflict("GROUP_CLOSED", "This group order is closed");
        return current;
    }

    /** An open group whose join window has passed behaves as locked; the row is updated so everyone sees the same state. */
    private Group effective(Group group) {
        if ("OPEN".equals(group.status()) && !group.joinUntil().isAfter(clock.instant())) {
            groups.setStatus(group.id(), "LOCKED", null, clock.instant());
            return new Group(group.id(), group.hostId(), group.kitchenId(), group.title(), group.joinCode(), "LOCKED", group.joinUntil(),
                    group.maxParticipants(), group.version() + 1, group.createdAt(), clock.instant());
        }
        return group;
    }

    private Group hosted(UUID groupId, UUID host, Long expectedVersion) {
        Group group = groups.find(groupId, true).orElseThrow(GroupOrderService::notFound);
        if (!group.hostId().equals(host)) {
            member(groupId, host);
            throw ApiProblem.forbidden("HOST_ONLY", "Only the host can do this");
        }
        if (expectedVersion != null && expectedVersion != group.version()) {
            throw new ApiProblem(412, "VERSION_MISMATCH", "The group order changed; reload and try again");
        }
        return effective(group);
    }

    private Participant member(UUID groupId, UUID person) {
        return groups.participant(groupId, person).filter(p -> p.removedAt() == null).orElseThrow(GroupOrderService::notFound);
    }

    private GroupOrderView view(UUID groupId, UUID viewer) {
        Group group = groups.find(groupId, false).orElseThrow(GroupOrderService::notFound);
        boolean host = group.hostId().equals(viewer);
        List<Participant> people = groups.participants(groupId).stream().filter(p -> p.removedAt() == null).toList();
        List<Item> items = groups.items(groupId);
        List<ParticipantView> views = new ArrayList<>();
        long total = 0;
        int count = 0;
        for (Participant p : people) {
            List<ItemView> mine = items.stream().filter(i -> i.participantId().equals(p.participantId()))
                    .map(i -> new ItemView(i.menuItemId(), i.itemName(), i.quantity(), i.unitPricePaise(), i.unitPricePaise() * i.quantity(), i.note()))
                    .toList();
            long subtotal = mine.stream().mapToLong(ItemView::lineTotalPaise).sum();
            total += subtotal;
            count += mine.stream().mapToInt(ItemView::quantity).sum();
            boolean you = p.participantId().equals(viewer);
            views.add(new ParticipantView(host || you ? p.participantId() : null, p.displayName(), p.role(), you, mine, subtotal));
        }
        String code = group.joinCode().substring(0, 4) + "-" + group.joinCode().substring(4);
        String status = "OPEN".equals(group.status()) && !group.joinUntil().isAfter(clock.instant()) ? "LOCKED" : group.status();
        boolean joinable = "OPEN".equals(status);
        return new GroupOrderView(group.id(), group.kitchenId(), group.title(), status, joinable ? code : null,
                joinable ? settings.publicWebOrigin() + "/g/" + code : null, group.joinUntil(), group.maxParticipants(), people.size(),
                group.version(), host, views, count, total, group.createdAt());
    }

    private String newCode() {
        for (int attempt = 0; attempt < 10; attempt++) {
            StringBuilder code = new StringBuilder(8);
            for (int i = 0; i < 8; i++) code.append(ALPHABET[random.nextInt(ALPHABET.length)]);
            if (!groups.codeExists(code.toString())) return code.toString();
        }
        throw new IllegalStateException("Could not allocate a join code");
    }

    private static String displayName(String requested, String fallback) {
        String name = requested == null ? "" : requested.strip().replaceAll("\\s+", " ");
        return name.isEmpty() ? fallback : name.length() > 40 ? name.substring(0, 40) : name;
    }

    private static ApiProblem notFound() {
        return ApiProblem.notFound("GROUP_NOT_FOUND", "Group order not found");
    }
}
