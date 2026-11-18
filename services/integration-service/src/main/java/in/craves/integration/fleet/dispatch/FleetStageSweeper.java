package in.craves.integration.fleet.dispatch;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryServiceBusPublisher;
import in.craves.integration.delivery.command.ProviderCreateAttemptRepository;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * CRAVES_FLEET_STAGE_SWEEPER, off | shadow | on (off: nothing here runs; R22 4.4 "S", 4.7). While riders decide, an
 * order's next dispatch look comes with a Service Bus message; if that message never comes, its offers stop. With shadow
 * or on, each look stores when the next one is due (trip_stage.next_match_at, FleetDispatcher.run), and every dispatch
 * tick this finds open fleet stages whose look is overdue by the margin with no pass holding their command. on: the
 * order's command is sent one message under a new id, and the worker's own claim decides whether a look runs. shadow:
 * counted and logged only. It never looks at an order itself and never writes a command, so it changes no offer.
 * With CRAVES_FLEET_TIMERS on as well, an overdue stage gets its look here (FleetTimers.look, which needs no command);
 * the message is sent only where that look could not go on.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetStageSweeper {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetStageSweeper.class);
    /** Stages a tick claims at most: each is one Service Bus send on the dispatch tick's thread. */
    static final int BATCH = 20;
    private static final Set<String> RUNNABLE = Set.of("SCHEDULED", "WAITING_FOR_PROVIDER", "FAILED", "PROCESSING");

    // The claim: the stage's next look moves one margin on, so no replica takes it again before then. A stage a look
    // holds (its row locked, or its command PROCESSING inside the worker's lease) is somebody's work and is left. Stages
    // whose deadline passed over 15 minutes ago stay as they are: switching this on touches no old order.
    private static final String CLAIM = """
        WITH due AS (
            SELECT s.id, s.trip_id, EXTRACT(EPOCH FROM now() - COALESCE(s.next_match_at, s.deadline_at))::int AS late
            FROM fleet_schema.trip_stage s
            WHERE s.state = 'OPEN' AND s.provider = 'CRAVES_FLEET'
              AND COALESCE(s.next_match_at, s.deadline_at) < now() - make_interval(secs => ?)
              AND s.deadline_at > now() - INTERVAL '15 minutes'
              AND NOT EXISTS (SELECT 1 FROM fleet_schema.trip t
                              JOIN delivery_schema.delivery_command c ON c.chef_sub_order_id = t.chef_sub_order_id
                              WHERE t.id = s.trip_id AND c.status = 'PROCESSING'
                                AND c.processing_started_at > now() - make_interval(mins => ?))
            ORDER BY COALESCE(s.next_match_at, s.deadline_at)
            LIMIT ?
            FOR UPDATE OF s SKIP LOCKED
        )
        UPDATE fleet_schema.trip_stage s
        SET next_match_at = now() + make_interval(secs => ?)
        FROM due
        JOIN fleet_schema.trip t ON t.id = due.trip_id
        LEFT JOIN delivery_schema.delivery_command c ON c.chef_sub_order_id = t.chef_sub_order_id
        WHERE s.id = due.id
        RETURNING s.trip_id, due.late, c.status, CAST(c.payload AS text) AS payload
        """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final DeliveryServiceBusPublisher publisher;
    private final DeliveryCommandProperties commands;
    private final String mode;
    private final int marginSeconds;
    private FleetTimers timers;

    @Autowired(required = false)
    public void setTimers(FleetTimers timers) {
        this.timers = timers;
    }

    public FleetStageSweeper(JdbcTemplate jdbc, ObjectMapper json, ObjectProvider<DeliveryServiceBusPublisher> publisher,
                             DeliveryCommandProperties commands,
                             @Value("${craves.fleet.stage-sweeper:off}") String mode,
                             @Value("${craves.fleet.stage-sweeper-margin-seconds:10}") int marginSeconds) {
        this.jdbc = jdbc;
        this.json = json;
        this.publisher = publisher.getIfAvailable();
        this.commands = commands;
        this.mode = mode(mode);
        if (marginSeconds < 5 || marginSeconds > 300) {
            throw new IllegalStateException("craves.fleet.stage-sweeper-margin-seconds must be between 5 and 300");
        }
        this.marginSeconds = marginSeconds;
    }

    /** Trimmed and lower-cased; unset or blank is off; any other value stops start-up. */
    static String mode(String value) {
        String mode = value == null || value.isBlank() ? "off" : value.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("off", "shadow", "on").contains(mode)) {
            throw new IllegalStateException("craves.fleet.stage-sweeper must be off, shadow or on");
        }
        return mode;
    }

    /** How many overdue stages this tick claimed. Never throws: the dispatch tick's other work goes on whatever happens here. */
    public int sweep() {
        if ("off".equals(mode)) {
            return 0;
        }
        try {
            // The lease the worker's takeover claim uses (DeliveryCommandSweeper reads the same).
            int leaseMinutes = commands.isBookingJournalEnabled() ? ProviderCreateAttemptRepository.COMMAND_LEASE_MINUTES : 10;
            List<Map<String, Object>> caught = jdbc.queryForList(CLAIM, marginSeconds, leaseMinutes, BATCH, marginSeconds);
            caught.forEach(this::rescue);
            return caught.size();
        } catch (RuntimeException exception) {
            LOGGER.error("FLEET_SWEEPER_FAILED error={}", exception.getClass().getSimpleName());
            return 0;
        }
    }

    private void rescue(Map<String, Object> stage) {
        String status = stage.get("status") == null ? "NONE" : (String) stage.get("status");
        boolean sent = false;
        String reason = "";
        if ("on".equals(mode) && timers != null && timers.on() && RUNNABLE.contains(status) && timers.look((UUID) stage.get("trip_id"))) {
            reason = " looked=true";
        } else if ("on".equals(mode) && publisher != null && RUNNABLE.contains(status)) {
            try {
                // A new id each time: the queue drops a repeated one for 10 minutes.
                publisher.publishNow(json.readValue((String) stage.get("payload"), DeliveryCommandMessage.class),
                    "fleet-sweep:" + stage.get("trip_id") + ":" + UUID.randomUUID());
                sent = true;
            } catch (RuntimeException | JsonProcessingException exception) {
                // Claimed again one margin from now.
                reason = " reason=" + exception.getClass().getSimpleName();
            }
        }
        LOGGER.warn("CRAVES_ALERT alert=FLEET_SWEEPER_CAUGHT mode={} trip={} commandStatus={} lateSeconds={} sent={}{}", mode,
            stage.get("trip_id"), status, stage.get("late"), sent, reason);
    }
}
