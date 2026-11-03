package in.craves.advanced.mydata;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.MissingNode;
import in.craves.advanced.platform.clients.AccountDataGateway;
import in.craves.advanced.platform.clients.AccountDataGateway.AccountDataAnswer;
import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.tastedata.PersonalDataEraser;
import in.craves.advanced.tastedata.TasteDataModule;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Everything Craves keeps about the caller, in one JSON download: their profile, addresses, orders and favorites as the owning services
 * return them to the caller (read with the caller's own token, so nobody sees more than those services already show them), a chef's
 * kitchen, and the advanced features' data. Sections that could not be read in full are listed in {@code missing}; nothing is stored here.
 */
@RestController
@RequestMapping("/api/v1/advanced/my-data")
public class MyDataController {
    /** A source read with the caller's token. Paged sources follow nextCursor and collect {@code listField}; one-off sources pass through. */
    record Source(String name, String path, String listField, boolean nothingWhenNotFound) { }

    static final List<Source> CUSTOMER_SOURCES = List.of(
            new Source("profile", "/api/v1/customer/profile", null, true),
            new Source("addresses", "/api/v1/customer/addresses", null, false),
            new Source("orders", "/api/v1/orders/page?limit=100", "orders", false),
            new Source("favoriteDishes", "/api/v1/customer/favorites", null, false),
            new Source("favoriteChefs", "/api/v1/customer/favorite-chefs?limit=100", "items", false),
            new Source("favoriteKitchens", "/api/v1/customer/favorite-kitchens?limit=100", "items", false));
    static final Source KITCHEN = new Source("kitchen", "/api/v1/kitchens/me", null, true);
    /** shortcut: 50 pages of 100 (5,000 orders or favorites); a longer history is reported as missing. Raise it if real accounts get there. */
    static final int MAX_PAGES = 50;
    /** Marks a source that could not be read in full. */
    private static final JsonNode MISSING = MissingNode.getInstance();
    private static final Logger log = LoggerFactory.getLogger(MyDataController.class);
    private final AccountDataGateway accounts;
    private final List<PersonalDataContributor> contributors;
    private final PersonalDataEraser modules;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final Clock clock;

    public MyDataController(AccountDataGateway accounts, List<PersonalDataContributor> contributors, PersonalDataEraser modules,
                            JdbcTemplate jdbc, ObjectMapper json, Clock clock) {
        this.accounts = accounts;
        this.contributors = contributors;
        this.modules = modules;
        this.jdbc = jdbc;
        this.json = json;
        this.clock = clock;
    }

    // shortcut: sources are read one after another (each read has a 5 s deadline); read them in parallel if exports get slow.
    @GetMapping("/export")
    public ResponseEntity<Map<String, Object>> exportMyCravesData() {
        UUID person = CurrentUser.id();
        String bearer = CurrentUser.bearerToken();
        Map<String, Object> export = new LinkedHashMap<>();
        export.put("personId", person);
        export.put("exportedAt", clock.instant());
        List<String> missing = new ArrayList<>();
        List<Source> sources = new ArrayList<>();
        // Riders and staff have no customer records; asking would only answer 403.
        if (CurrentUser.hasRole(Roles.CUSTOMER)) sources.addAll(CUSTOMER_SOURCES);
        if (CurrentUser.hasRole(Roles.CHEF)) sources.add(KITCHEN);
        for (Source source : sources) {
            JsonNode value = source.listField() == null ? one(bearer, source) : all(bearer, source);
            if (value == MISSING) {
                missing.add(source.name());
                value = null;
            }
            export.put(source.name(), value);
        }
        Map<String, Object> advanced = new LinkedHashMap<>();
        if (modules.usable(TasteDataModule.ID)) {
            advanced.put("consent", jdbc.queryForList("SELECT personalization, product_analytics, updated_at FROM adv_taste_data.consent "
                    + "WHERE person_id = ?", person).stream().findFirst().orElse(null));
        } else {
            missing.add(TasteDataModule.ID);
        }
        for (PersonalDataContributor contributor : contributors) {
            if (!modules.usable(contributor.moduleId())) {
                missing.add(contributor.moduleId());
                continue;
            }
            try {
                advanced.put(contributor.moduleId(), contributor.export(person));
            } catch (RuntimeException failure) {
                // One module failing must not lose the rest of the download; the person is told which part is missing.
                log.warn("My-data export: module {} failed ({})", contributor.moduleId(), failure.getClass().getSimpleName());
                missing.add(contributor.moduleId());
            }
        }
        export.put("advancedFeatures", advanced);
        export.put("complete", missing.isEmpty());
        export.put("missing", missing);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Content-Disposition", "attachment; filename=\"craves-my-data.json\"").body(export);
    }

    private JsonNode one(String bearer, Source source) {
        AccountDataAnswer answer = read(bearer, source.path());
        if (answer.status() == 200 && answer.body() != null) return answer.body();
        if (answer.status() == 404 && source.nothingWhenNotFound()) return null;
        return MISSING;
    }

    private JsonNode all(String bearer, Source source) {
        ArrayNode rows = json.createArrayNode();
        String cursor = null;
        for (int page = 0; page < MAX_PAGES; page++) {
            String path = cursor == null ? source.path() : source.path() + "&cursor=" + URLEncoder.encode(cursor, StandardCharsets.UTF_8);
            AccountDataAnswer answer = read(bearer, path);
            if (answer.status() != 200 || answer.body() == null || !answer.body().path(source.listField()).isArray()) return MISSING;
            rows.addAll((ArrayNode) answer.body().path(source.listField()));
            JsonNode next = answer.body().path("nextCursor");
            boolean more = next.isTextual() && !next.asText().isBlank() && answer.body().path("hasMore").asBoolean(true);
            if (!more) return rows;
            cursor = next.asText();
        }
        return MISSING;
    }

    private AccountDataAnswer read(String bearer, String path) {
        AccountDataAnswer answer = accounts.read(bearer, path);
        if (answer.status() == 401) throw new ApiProblem(401, "AUTHENTICATION_REQUIRED", "Sign in again to continue");
        return answer;
    }
}
