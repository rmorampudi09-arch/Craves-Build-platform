package in.craves.advanced.platform.erasure;

import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.data.Sql;
import in.craves.advanced.platform.module.FeatureModule;
import in.craves.advanced.platform.module.ModuleRuntime;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.tastedata.TasteDataModule;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Erases a person's data in every advanced module: for their own "delete my taste data" and for the auth-service deletion coordinator. */
@Service
public class AccountErasureService {
    public static final String SERVICE = "advanced";

    public enum Scope { CUSTOMER, CHEF, ALL }

    /** What an erase removed. {@code receiptId} is null when none was written. */
    public record Erased(UUID receiptId, int recordsErased, List<String> modules, Instant erasedAt, Map<String, Integer> counts) { }

    private static final Logger log = LoggerFactory.getLogger(AccountErasureService.class);
    private static final String PLATFORM_SCHEMA = "adv_platform";

    private final List<PersonalDataContributor> contributors;
    private final ModuleRuntime runtime;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public AccountErasureService(List<PersonalDataContributor> contributors, ModuleRuntime runtime, JdbcTemplate jdbc, Clock clock) {
        this.contributors = contributors;
        this.runtime = runtime;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /**
     * The person's consent, every module's data and their stored keyed replies, then a receipt. {@code includeDisabled=false} (the
     * person's own request) skips a module that is switched off or failed and always leaves a receipt; {@code true} (the deletion
     * coordinator) also erases such a module when its schema was migrated at some point, and leaves a receipt only when it removed something.
     */
    @Transactional
    public Erased eraseAll(UUID person, boolean includeDisabled) {
        boolean tasteData = reachable(TasteDataModule.ID, includeDisabled);
        Map<String, Integer> counts = new LinkedHashMap<>();
        counts.put(TasteDataModule.ID, tasteData ? jdbc.update("DELETE FROM adv_taste_data.consent WHERE person_id = ?", person) : 0);
        List<String> modules = eraseModules(person, includeDisabled, counts);
        // Stored replies of the person's keyed requests (they can hold names and notes) go too; they are caches, so the receipt does not count them.
        // shortcut: no index on actor_id; the table keeps only 48 hours of keyed requests. Add one if erasing gets slow.
        if (!includeDisabled || migrated(PLATFORM_SCHEMA)) jdbc.update("DELETE FROM adv_platform.idempotency_record WHERE actor_id = ?", person);
        return receipt(person, tasteData, includeDisabled, modules, counts);
    }

    /**
     * What the coordinator asks for. CUSTOMER and ALL erase everything, including modules that are switched off. CHEF erases nothing:
     * every module's data is the person's own as a customer, and the chef's ids in kitchen-capacity (batch, kitchen_load) are kitchen
     * operating records that stay, so a dual-role person's customer data survives a chef-only request.
     */
    @Transactional
    public Map<String, Integer> erase(UUID requestId, UUID identity, Scope scope) {
        Map<String, Integer> counts = scope == Scope.CHEF ? Map.of() : eraseAll(identity, true).counts();
        log.info("account erasure service={} requestId={} scope={} counts={}", SERVICE, requestId, scope, counts);
        return counts;
    }

    private List<String> eraseModules(UUID person, boolean includeDisabled, Map<String, Integer> counts) {
        List<String> modules = new ArrayList<>();
        for (PersonalDataContributor contributor : contributors) {
            if (reachable(contributor.moduleId(), includeDisabled)) {
                counts.put(contributor.moduleId(), contributor.erase(person));
                modules.add(contributor.moduleId());
            } else {
                counts.put(contributor.moduleId(), 0);
            }
        }
        return modules;
    }

    private Erased receipt(UUID person, boolean tasteData, boolean includeDisabled, List<String> modules, Map<String, Integer> counts) {
        int total = counts.values().stream().mapToInt(Integer::intValue).sum();
        Instant now = clock.instant();
        UUID receipt = null;
        if (tasteData && (!includeDisabled || total > 0)) {
            receipt = UUID.randomUUID();
            jdbc.update("INSERT INTO adv_taste_data.erasure_receipt (id, person_id, records, modules, created_at) VALUES (?,?,?,?,?)",
                    receipt, person, total, modules.toArray(String[]::new), Sql.ts(now));
        }
        return new Erased(receipt, total, modules, now, counts);
    }

    /** True when the module is ready to use, or (with {@code includeDisabled}) when it is off or failed but its schema was migrated once. */
    private boolean reachable(String moduleId, boolean includeDisabled) {
        FeatureModule module = runtime.modules().stream().filter(m -> m.id().equals(moduleId)).findFirst().orElse(null);
        if (module == null) return false;
        try {
            runtime.ensureReady(module);
            return true;
        } catch (ApiProblem unavailable) {
            return includeDisabled && migrated(module.schema());
        }
    }

    /**
     * The schema has a successful migration. A schema that exists but never migrated (first migration failed) has no tables to erase from.
     * Schema names are the fixed {@code adv_*} names of {@link FeatureModule}, never input.
     */
    private boolean migrated(String schema) {
        String history = schema + ".flyway_schema_history";
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_regclass(?) IS NOT NULL", Boolean.class, history))
                && Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM " + history + " WHERE success)", Boolean.class));
    }
}
