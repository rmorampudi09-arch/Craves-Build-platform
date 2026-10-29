package in.craves.integration.fleet.engine;

import java.util.Locale;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * craves.fleet.engine.* (docs/riders/SCALE.md, "Switches"): how integration-service works with the fleet engine
 * (services/fleet-engine).
 * mode: off (the default: nothing is written to Redis), shadow (rider events and every order's ranking go to the engine,
 * which compares and logs; offers stay Java's), or live (dispatch asks the engine first and falls back to its own ranking
 * after replyTimeoutMs). joint lets the engine share out orders asked at once (DISPATCH.md: a rules change, so 14 days'
 * notice to riders first). The partition counts and keyPrefix must equal the engine's FLEET_ENGINE_* settings. A value
 * that can't be used is logged as CRAVES_ALERT and replaced (an unknown mode by off), so a typo never stops the service:
 * the settings bind as text (Settings) and are read here.
 */
public record FleetEngineProperties(
    String mode,
    boolean joint,
    int riderPartitions,
    int dispatchPartitions,
    int streamKeepSeconds,
    int replyTimeoutMs,
    int queueCapacity,
    String keyPrefix
) {
    /**
     * craves.fleet.engine.* as written. Every value binds as text, so a typo (300ms, enabled, 10k) can't stop the service
     * starting, as a number or flag that fails to bind would: parsed() logs CRAVES_ALERT and uses the default instead.
     */
    @ConfigurationProperties("craves.fleet.engine")
    public record Settings(String mode, String joint, String riderPartitions, String dispatchPartitions, String streamKeepSeconds,
                           String replyTimeoutMs, String queueCapacity, String keyPrefix) {
        public FleetEngineProperties parsed() {
            return new FleetEngineProperties(mode, flag("CRAVES_FLEET_ENGINE_JOINT", joint),
                number("CRAVES_FLEET_ENGINE_RIDER_PARTITIONS", riderPartitions, 16),
                number("CRAVES_FLEET_ENGINE_DISPATCH_PARTITIONS", dispatchPartitions, 16),
                number("CRAVES_FLEET_ENGINE_STREAM_KEEP_SECONDS", streamKeepSeconds, 120),
                number("CRAVES_FLEET_ENGINE_REPLY_TIMEOUT_MS", replyTimeoutMs, 300),
                number("CRAVES_FLEET_ENGINE_QUEUE_CAPACITY", queueCapacity, 10_000), keyPrefix);
        }

        private static boolean flag(String name, String value) {
            String text = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
            if (text.isEmpty() || text.equals("false")) {
                return false;
            }
            if (text.equals("true")) {
                return true;
            }
            alert(name + " must be true or false, not " + text + "; false is used");
            return false;
        }

        private static int number(String name, String value, int otherwise) {
            String text = value == null ? "" : value.trim();
            if (text.isEmpty()) {
                return otherwise;
            }
            try {
                return Integer.parseInt(text);
            } catch (NumberFormatException notANumber) {
                alert(name + " must be a whole number, not " + text + "; " + otherwise + " is used");
                return otherwise;
            }
        }
    }

    public FleetEngineProperties {
        String asked = mode == null ? "off" : mode.trim().toLowerCase(Locale.ROOT);
        // YAML 1.1 reads a bare off as false.
        mode = "false".equals(asked) ? "off" : asked;
        if (!mode.equals("off") && !mode.equals("shadow") && !mode.equals("live")) {
            alert("CRAVES_FLEET_ENGINE_MODE must be off, shadow or live, not " + mode + "; the engine stays off");
            mode = "off";
        }
        riderPartitions = partitions("CRAVES_FLEET_ENGINE_RIDER_PARTITIONS", riderPartitions);
        dispatchPartitions = partitions("CRAVES_FLEET_ENGINE_DISPATCH_PARTITIONS", dispatchPartitions);
        replyTimeoutMs = Math.max(50, Math.min(2_000, replyTimeoutMs));
        queueCapacity = Math.max(100, queueCapacity);
        // The engine replays a minute after taking over a partition; streams keep twice that, by age, so their memory follows
        // the event rate and a small shared cache can't fill up with old entries.
        streamKeepSeconds = Math.max(60, Math.min(3_600, streamKeepSeconds));
        keyPrefix = keyPrefix == null || keyPrefix.isBlank() ? "craves:fleet:" : keyPrefix;
    }

    public boolean live() {
        return "live".equals(mode);
    }

    public boolean shadow() {
        return "shadow".equals(mode);
    }

    private static int partitions(String name, int value) {
        if (value >= 1 && value <= 1024) {
            return value;
        }
        alert(name + " must be 1 to 1024, not " + value + "; 16 is used");
        return 16;
    }

    private static void alert(String message) {
        LoggerFactory.getLogger(FleetEngineProperties.class).error("CRAVES_ALERT alert=FLEET_ENGINE_SETTING {}", message);
    }
}
