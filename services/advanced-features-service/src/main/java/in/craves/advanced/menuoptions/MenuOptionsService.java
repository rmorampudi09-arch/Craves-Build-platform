package in.craves.advanced.menuoptions;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.menuoptions.MenuOptionsDtos.DishOptions;
import in.craves.advanced.menuoptions.MenuOptionsDtos.DishOptionsRequest;
import in.craves.advanced.menuoptions.MenuOptionsDtos.KitchenMealPeriods;
import in.craves.advanced.menuoptions.MenuOptionsDtos.MealPeriod;
import in.craves.advanced.menuoptions.MenuOptionsDtos.MealPeriodWindow;
import in.craves.advanced.menuoptions.MenuOptionsDtos.MealPeriodsRequest;
import in.craves.advanced.menuoptions.MenuOptionsDtos.OptionGroup;
import in.craves.advanced.menuoptions.MenuOptionsDtos.PriceQuote;
import in.craves.advanced.menuoptions.MenuOptionsDtos.PriceQuoteRequest;
import in.craves.advanced.menuoptions.MenuOptionsDtos.QuotedChoice;
import in.craves.advanced.menuoptions.MenuOptionsRepository.Row;
import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MenuOptionsService {
    private static final TypeReference<List<OptionGroup>> GROUPS = new TypeReference<>() { };
    private final MenuOptionsRepository repository;
    private final CatalogGateway catalog;
    private final Audit audit;
    private final ObjectMapper json;
    private final Clock clock;

    public MenuOptionsService(MenuOptionsRepository repository, CatalogGateway catalog, Audit audit, ObjectMapper json, Clock clock) {
        this.repository = repository;
        this.catalog = catalog;
        this.audit = audit;
        this.json = json;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public DishOptions dishOptions(UUID menuItemId) {
        return repository.find(menuItemId, false).map(this::view)
                .orElseThrow(() -> ApiProblem.notFound("OPTIONS_NOT_FOUND", "This dish has no options or meal periods"));
    }

    @Transactional(readOnly = true)
    public List<DishOptions> lookup(List<UUID> menuItemIds) {
        return repository.find(menuItemIds.stream().distinct().toList()).stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public KitchenMealPeriods kitchenMealPeriods(UUID kitchenId) {
        List<MealPeriodWindow> windows = repository.periods(kitchenId);
        ZonedDateTime now = clock.instant().atZone(MenuOptionsRules.INDIA);
        List<MealPeriod> serving = windows.stream().filter(window -> MenuOptionsRules.serves(window, now)).map(MealPeriodWindow::period).toList();
        return new KitchenMealPeriods(kitchenId, MenuOptionsRules.INDIA.getId(), windows, serving);
    }

    @Transactional(readOnly = true)
    public DishOptions chefDishOptions(String chefToken, UUID menuItemId) {
        MenuItem item = owned(chefToken, menuItemId);
        return repository.find(menuItemId, false).map(this::view)
                .orElse(new DishOptions(menuItemId, item.kitchenId(), List.of(), List.of(), 0, null));
    }

    @Transactional
    public DishOptions setDishOptions(UUID chef, String chefToken, UUID menuItemId, DishOptionsRequest request, Long expectedVersion) {
        MenuItem item = owned(chefToken, menuItemId);
        if (item.kitchenId() == null) throw ApiProblem.conflict("KITCHEN_UNKNOWN", "Catalog did not name this dish's kitchen; try again");
        List<OptionGroup> groups = MenuOptionsRules.normalise(request.groups());
        List<MealPeriod> periods = request.mealPeriods() == null ? List.of() : request.mealPeriods().stream().sorted().toList();
        repository.lockKitchen(item.kitchenId());
        Set<MealPeriod> defined = EnumSet.noneOf(MealPeriod.class);
        repository.periods(item.kitchenId()).forEach(window -> defined.add(window.period()));
        List<String> missing = periods.stream().filter(period -> !defined.contains(period)).map(Enum::name).toList();
        if (!missing.isEmpty()) throw new ApiProblem(400, "PERIOD_NOT_DEFINED", "Set your kitchen's hours for these meals first", missing);
        String body = write(groups);
        Instant now = clock.instant();
        Optional<Row> existing = repository.find(menuItemId, true);
        if (existing.isEmpty()) {
            if (expectedVersion != null && expectedVersion != 0) throw versionMismatch();
            repository.insert(menuItemId, chef, item.kitchenId(), body, periods, now);
        } else {
            Row row = existing.get();
            if (!row.chefId().equals(chef)) throw ApiProblem.forbidden("NOT_YOUR_MENU_ITEM", "This dish belongs to another chef");
            if (expectedVersion != null && expectedVersion != row.version()) throw versionMismatch();
            repository.update(menuItemId, item.kitchenId(), body, periods, now);
        }
        audit.record(MenuOptionsModule.ID, chef, "OPTIONS_SET", "menu_item", menuItemId,
                Map.of("groups", groups.size(), "mealPeriods", periods.stream().map(Enum::name).toList()));
        return view(repository.find(menuItemId, false).orElseThrow());
    }

    @Transactional
    public void clearDishOptions(UUID chef, String chefToken, UUID menuItemId) {
        owned(chefToken, menuItemId);
        Row row = repository.find(menuItemId, true).orElseThrow(() -> ApiProblem.notFound("OPTIONS_NOT_FOUND", "This dish has no options"));
        if (!row.chefId().equals(chef)) throw ApiProblem.forbidden("NOT_YOUR_MENU_ITEM", "This dish belongs to another chef");
        repository.delete(menuItemId);
        audit.record(MenuOptionsModule.ID, chef, "OPTIONS_CLEARED", "menu_item", menuItemId, Map.of());
    }

    @Transactional(readOnly = true)
    public KitchenMealPeriods chefMealPeriods(String chefToken) {
        return kitchenMealPeriods(kitchenOf(chefToken));
    }

    /** Replaces the kitchen's meal hours. A meal that dishes are still labelled with cannot be removed. */
    @Transactional
    public KitchenMealPeriods setMealPeriods(UUID chef, String chefToken, MealPeriodsRequest request) {
        UUID kitchen = kitchenOf(chefToken);
        List<MealPeriodWindow> windows = new ArrayList<>();
        Set<MealPeriod> seen = EnumSet.noneOf(MealPeriod.class);
        for (MealPeriodWindow window : request.periods()) {
            if (!seen.add(window.period())) throw ApiProblem.badRequest("DUPLICATE_PERIOD", window.period() + " is listed twice");
            if (window.startsAt().equals(window.endsAt())) throw ApiProblem.badRequest("EMPTY_WINDOW", window.period() + " starts when it ends");
            Set<DayOfWeek> days = window.days() == null ? EnumSet.allOf(DayOfWeek.class) : EnumSet.copyOf(window.days());
            windows.add(new MealPeriodWindow(window.period(), window.startsAt(), window.endsAt(), days));
        }
        repository.lockKitchen(kitchen);
        Set<MealPeriod> removed = new HashSet<>(repository.periodsInUse(kitchen));
        removed.removeAll(seen);
        if (!removed.isEmpty()) {
            throw new ApiProblem(409, "PERIOD_IN_USE", "Dishes are still labelled with these meals", removed.stream().sorted().map(Enum::name).toList());
        }
        repository.replacePeriods(kitchen, chef, windows, clock.instant());
        audit.record(MenuOptionsModule.ID, chef, "MEAL_PERIODS_SET", "kitchen", kitchen, Map.of("periods", seen.stream().map(Enum::name).toList()));
        return kitchenMealPeriods(kitchen);
    }

    /** The price of one dish with the chosen options, checked against Catalog's live price and availability. */
    @Transactional(readOnly = true)
    public PriceQuote quote(PriceQuoteRequest request) {
        MenuItem item = catalog.purchasable(List.of(request.menuItemId())).get(request.menuItemId());
        if (item == null) throw ApiProblem.conflict("ITEM_UNAVAILABLE", "This dish cannot be ordered right now");
        if (item.pricePaise() == null) throw ApiProblem.conflict("PRICE_UNAVAILABLE", "Catalog did not give this dish's price");
        Optional<Row> row = repository.find(request.menuItemId(), false);
        List<QuotedChoice> chosen = MenuOptionsRules.select(row.map(r -> read(r.groups())).orElse(List.of()), request.choiceIds());
        MealPeriod period = null;
        if (row.isPresent() && !row.get().mealPeriods().isEmpty()) {
            ZonedDateTime when = Objects.requireNonNullElse(request.at(), clock.instant()).atZone(MenuOptionsRules.INDIA);
            period = repository.periods(row.get().kitchenId()).stream()
                    .filter(window -> row.get().mealPeriods().contains(window.period()) && MenuOptionsRules.serves(window, when))
                    .map(MealPeriodWindow::period).findFirst()
                    .orElseThrow(() -> new ApiProblem(409, "NOT_SERVED_AT_THIS_TIME", "This dish is served only at these meals",
                            row.get().mealPeriods().stream().map(Enum::name).toList()));
        }
        long unit = item.pricePaise();
        for (QuotedChoice choice : chosen) unit = Math.addExact(unit, choice.priceDeltaPaise());
        return new PriceQuote(request.menuItemId(), item.pricePaise(), chosen, unit, request.quantity(),
                Math.multiplyExact(unit, request.quantity()), row.map(Row::version).orElse(0L), period);
    }

    private UUID kitchenOf(String chefToken) {
        return catalog.chefMenuItems(chefToken).values().stream().map(MenuItem::kitchenId).filter(Objects::nonNull).findFirst()
                .orElseThrow(() -> ApiProblem.conflict("KITCHEN_HAS_NO_DISHES", "Add a dish to your menu before setting meal hours"));
    }

    private MenuItem owned(String chefToken, UUID menuItemId) {
        MenuItem item = catalog.chefMenuItems(chefToken).get(menuItemId);
        if (item == null) throw ApiProblem.forbidden("NOT_YOUR_MENU_ITEM", "This dish is not on your menu");
        return item;
    }

    private DishOptions view(Row row) {
        return new DishOptions(row.menuItemId(), row.kitchenId(), read(row.groups()), row.mealPeriods(), row.version(), row.updatedAt());
    }

    private String write(List<OptionGroup> groups) {
        try {
            return json.writeValueAsString(groups);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private List<OptionGroup> read(String body) {
        try {
            return json.readValue(body, GROUPS);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Stored options are unreadable", ex);
        }
    }

    private static ApiProblem versionMismatch() {
        return new ApiProblem(412, "VERSION_MISMATCH", "These options changed since you loaded them; reload and try again");
    }
}
