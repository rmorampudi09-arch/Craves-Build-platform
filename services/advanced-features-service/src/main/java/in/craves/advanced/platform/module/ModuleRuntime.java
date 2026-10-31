package in.craves.advanced.platform.module;

import in.craves.advanced.platform.web.ApiProblem;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Keeps every module independent at runtime. Each module migrates its own schema; a module whose migration fails
 * (or whose switch is off) answers 503 while every other module keeps serving. Failed modules retry lazily.
 */
@Component
public class ModuleRuntime {
    public enum State { DISABLED, PENDING, READY, FAILED }

    public record Status(String id, String schema, boolean enabled, State state, Instant lastAttempt, String lastError) { }

    private static final Logger log = LoggerFactory.getLogger(ModuleRuntime.class);
    private static final Duration RETRY_AFTER = Duration.ofSeconds(30);
    static final FeatureModule PLATFORM = new FeatureModule("platform", "adv_platform", List.of(), List.of(), List.of());

    private final List<FeatureModule> modules;
    private final DataSource dataSource;
    private final Environment environment;
    private final Clock clock;
    private final int concurrency;
    private final Map<String, Status> states = new ConcurrentHashMap<>();
    private final Map<String, Semaphore> bulkheads = new ConcurrentHashMap<>();

    public ModuleRuntime(List<FeatureModule> modules, DataSource dataSource, Environment environment, Clock clock,
                         in.craves.advanced.platform.AdvancedSettings settings) {
        this.modules = modules.stream().sorted(Comparator.comparing(FeatureModule::id)).toList();
        this.dataSource = dataSource;
        this.environment = environment;
        this.clock = clock;
        this.concurrency = settings.moduleConcurrency();
        long distinctIds = this.modules.stream().map(FeatureModule::id).distinct().count();
        long distinctSchemas = this.modules.stream().map(FeatureModule::schema).distinct().count();
        if (distinctIds != this.modules.size() || distinctSchemas != this.modules.size()) {
            throw new IllegalStateException("Module ids and schemas must be unique");
        }
        for (FeatureModule module : this.modules) {
            boolean enabled = enabled(module);
            states.put(module.id(), new Status(module.id(), module.schema(), enabled, enabled ? State.PENDING : State.DISABLED, null, null));
            bulkheads.put(module.id(), new Semaphore(concurrency));
        }
        states.put(PLATFORM.id(), new Status(PLATFORM.id(), PLATFORM.schema(), true, State.PENDING, null, null));
    }

    public List<FeatureModule> modules() {
        return modules;
    }

    public boolean enabled(FeatureModule module) {
        return environment.getProperty(module.flagName(), Boolean.class, true);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void migrateAllOnStartup() {
        for (FeatureModule module : modules) {
            if (states.get(module.id()).state() == State.DISABLED) continue;
            try {
                ensureReady(module);
            } catch (ApiProblem ignored) {
                // Logged in attempt(); the module stays FAILED and retries on its next request.
            }
        }
    }

    public Optional<FeatureModule> moduleFor(String path) {
        return modules.stream().filter(module -> module.serves(path)).findFirst();
    }

    /** Throws 503 FEATURE_DISABLED / FEATURE_UNAVAILABLE unless the module (and the platform schema) are migrated. */
    public void ensureReady(FeatureModule module) {
        Status status = states.get(module.id());
        if (status.state() == State.DISABLED) {
            throw ApiProblem.unavailable("FEATURE_DISABLED", "This feature is switched off");
        }
        if (status.state() == State.READY) return;
        if (!attempt(PLATFORM) || !attempt(module)) {
            throw ApiProblem.unavailable("FEATURE_UNAVAILABLE", "This feature is temporarily unavailable");
        }
    }

    private boolean attempt(FeatureModule module) {
        Status current = states.get(module.id());
        if (current.state() == State.READY) return true;
        synchronized (this) {
            current = states.get(module.id());
            if (current.state() == State.READY) return true;
            Instant now = clock.instant();
            if (current.lastAttempt() != null && current.state() == State.FAILED
                    && current.lastAttempt().plus(RETRY_AFTER).isAfter(now)) {
                return false;
            }
            try {
                Flyway.configure().dataSource(dataSource).schemas(module.schema()).defaultSchema(module.schema())
                        .createSchemas(true).locations(module.migrations()).table("flyway_schema_history")
                        .validateMigrationNaming(true).cleanDisabled(true).load().migrate();
                states.put(module.id(), new Status(module.id(), module.schema(), true, State.READY, now, null));
                log.info("Module {} ready (schema {})", module.id(), module.schema());
                return true;
            } catch (RuntimeException ex) {
                String reason = ex.getClass().getSimpleName() + ": " + String.valueOf(ex.getMessage()).lines().findFirst().orElse("");
                states.put(module.id(), new Status(module.id(), module.schema(), true, State.FAILED, now,
                        reason.length() > 300 ? reason.substring(0, 300) : reason));
                log.error("Module {} is unavailable: migration failed", module.id(), ex);
                return false;
            }
        }
    }

    public Semaphore bulkhead(FeatureModule module) {
        return bulkheads.get(module.id());
    }

    public Map<String, Status> statuses() {
        Map<String, Status> ordered = new LinkedHashMap<>();
        ordered.put(PLATFORM.id(), states.get(PLATFORM.id()));
        modules.forEach(module -> ordered.put(module.id(), states.get(module.id())));
        return ordered;
    }
}
