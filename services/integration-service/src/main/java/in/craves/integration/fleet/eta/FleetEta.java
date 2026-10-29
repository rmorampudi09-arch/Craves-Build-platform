package in.craves.integration.fleet.eta;

import in.craves.integration.fleet.engine.FleetEngineFeed;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.BiConsumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The travel-time model in integration-service (ml/fleet-eta/README.md; docs/riders/DISPATCH.md §2). craves.fleet.eta.mode:
 * <ul>
 *   <li>off (the default): nothing is loaded;</li>
 *   <li>shadow: the version is loaded, and for each order dispatch ranks it logs the riders the model would ask first beside
 *       today's (FLEET_ETA_SHADOW); nothing riders or chefs see changes;</li>
 *   <li>live: offers and the chef's arrival time show the model's minutes (shown()). It decides who hears first only where
 *       the dispatch policy says so (rank_by_travel_time, a rule riders get 14 days' notice of), and only if the version
 *       was judged to rank riders at least as well as today's rule (ranking()); otherwise ranking stays by distance and
 *       is compared, as in shadow.</li>
 * </ul>
 * craves.fleet.eta.model-version names a row of fleet_schema.eta_model, which python -m fleet_eta sql writes with the
 * judgement it was trained with. A version that is missing or can't be read logs CRAVES_ALERT and today's rule stays, tried
 * again a minute later, so a bad setting never stops dispatch. Live, the model is published to the fleet engine's Redis
 * (FleetEngineFeed.publish) as it is used, at most every 10 minutes; the engine is asked to rank by it only once it has it
 * (published()).
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetEta {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetEta.class);
    static final long RETRY_MS = 60_000;
    static final long REPUBLISH_MS = 600_000;

    private final JdbcTemplate jdbc;
    private final String mode;
    private final String version;
    private final ReentrantLock loading = new ReentrantLock();
    private final AtomicBoolean publishing = new AtomicBoolean();
    private volatile EtaModel model;
    private volatile byte[] modelJson;
    private volatile boolean ranksWell;
    private volatile boolean published;
    private volatile long triedAtMs;
    private volatile long publishedAtMs;
    /** Writes the model where the fleet engine reads it (key suffix "model:eta:<version>", value); null: the engine is off. */
    private volatile BiConsumer<String, byte[]> publisher;

    public FleetEta(JdbcTemplate jdbc, @Value("${craves.fleet.eta.mode:off}") String mode,
                    @Value("${craves.fleet.eta.model-version:}") String version) {
        this.jdbc = jdbc;
        String asked = mode == null ? "off" : mode.trim().toLowerCase(Locale.ROOT);
        asked = "false".equals(asked) ? "off" : asked; // YAML 1.1 reads a bare off as false
        if (!List.of("off", "shadow", "live").contains(asked)) {
            LOGGER.error("CRAVES_ALERT alert=FLEET_ETA_MODE_UNKNOWN mode={} (CRAVES_FLEET_ETA_MODE must be off, shadow or live; off is used)",
                asked);
            asked = "off";
        }
        this.mode = asked;
        this.version = version == null ? "" : version.trim();
    }

    /** With the fleet engine on (shadow or live), live models are published where it reads them. */
    @Autowired(required = false)
    public void setEngine(FleetEngineFeed feed) {
        if (feed.on()) {
            publishTo(feed::publish);
        }
    }

    /** Where to publish the model: a key under the engine's prefix and the model's JSON. */
    void publishTo(BiConsumer<String, byte[]> publisher) {
        this.publisher = publisher;
    }

    public String mode() {
        return mode;
    }

    /** The loaded model, in shadow or live, to compare rankings with; else null. */
    public EtaModel model() {
        return "off".equals(mode) ? null : loaded();
    }

    /** Live and loaded: the model whose minutes offers and chefs are shown; else null (20 km/h on the distances). */
    public EtaModel shown() {
        if (!"live".equals(mode)) {
            return null;
        }
        EtaModel m = loaded();
        if (m != null) {
            publishSoon();
        }
        return m;
    }

    /**
     * The model that may decide who hears first where the dispatch policy ranks by travel time: shown(), and judged when it
     * was trained to put riders in the right order at least as often as today's rule. Else null: by distance.
     */
    public EtaModel ranking() {
        EtaModel m = shown();
        return m != null && ranksWell ? m : null;
    }

    /** The fleet engine has the loaded version, so it can be asked to rank by it. */
    public boolean published() {
        return published;
    }

    EtaModel loaded() {
        EtaModel m = model;
        if (m != null || System.currentTimeMillis() - triedAtMs < RETRY_MS || !loading.tryLock()) {
            return m;
        }
        try {
            if (model == null && System.currentTimeMillis() - triedAtMs >= RETRY_MS) {
                triedAtMs = System.currentTimeMillis();
                load();
            }
            return model;
        } finally {
            loading.unlock();
        }
    }

    private void load() {
        if (version.isEmpty()) {
            LOGGER.error("CRAVES_ALERT alert=FLEET_ETA_MODEL_UNSET mode={} (set CRAVES_FLEET_ETA_MODEL_VERSION; today's rule is used)", mode);
            return;
        }
        try {
            List<Map<String, Object>> rows = jdbc.queryForList("SELECT model::text AS model, metrics -> 'heldOutTest' ->> 'rankingVerdict' "
                + "AS ranking FROM fleet_schema.eta_model WHERE version = ?", version);
            if (rows.isEmpty()) {
                LOGGER.error("CRAVES_ALERT alert=FLEET_ETA_MODEL_MISSING version={} (no row in fleet_schema.eta_model; today's rule is used)",
                    version);
                return;
            }
            String json = (String) rows.get(0).get("model");
            EtaModel parsed = EtaModel.parse(json);
            if (!parsed.version().equals(version)) {
                throw new IllegalArgumentException("the row holds version " + parsed.version());
            }
            Object ranking = rows.get(0).get("ranking");
            ranksWell = "better".equals(ranking);
            modelJson = json.getBytes(StandardCharsets.UTF_8);
            model = parsed;
            LOGGER.info("FLEET_ETA_LOADED version={} mode={} ranking={}", version, mode, ranking == null ? "unjudged" : ranking);
        } catch (RuntimeException e) {
            LOGGER.error("CRAVES_ALERT alert=FLEET_ETA_MODEL_REFUSED version={} reason={} (today's rule is used)", version, e.getMessage());
        }
    }

    /** At most every 10 minutes, in the background: the engine reloads only a version it hasn't got, so this only keeps it there. */
    private void publishSoon() {
        BiConsumer<String, byte[]> to = publisher;
        long now = System.currentTimeMillis();
        if (to == null || now - publishedAtMs < REPUBLISH_MS || !publishing.compareAndSet(false, true)) {
            return;
        }
        Thread.ofVirtual().name("fleet-eta-publish").start(() -> {
            try {
                to.accept("model:eta:" + version, modelJson);
                publishedAtMs = System.currentTimeMillis();
                published = true;
            } catch (RuntimeException e) {
                publishedAtMs = System.currentTimeMillis() - REPUBLISH_MS + RETRY_MS; // again in a minute
                LOGGER.warn("FLEET_ETA_PUBLISH_FAILED version={} error={}", version, e.getClass().getSimpleName());
            } finally {
                publishing.set(false);
            }
        });
    }
}
