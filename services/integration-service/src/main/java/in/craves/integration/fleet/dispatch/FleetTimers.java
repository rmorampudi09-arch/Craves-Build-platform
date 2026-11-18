package in.craves.integration.fleet.dispatch;

import com.azure.core.amqp.AmqpRetryMode;
import com.azure.core.amqp.AmqpRetryOptions;
import com.azure.messaging.servicebus.ServiceBusMessage;
import com.azure.messaging.servicebus.ServiceBusProcessorClient;
import com.azure.messaging.servicebus.ServiceBusSenderClient;
import in.craves.integration.delivery.command.DeliveryCommandWake;
import in.craves.integration.delivery.command.DeliveryServiceBusConfiguration.DeliveryServiceBusClientFactory;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetPolicyStore.DispatchPolicy;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BiConsumer;
import java.util.function.BooleanSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * CRAVES_FLEET_TIMERS, off | shadow | on (off: nothing here runs, no Service Bus client is built; R22 4.4, 4.7). Today an
 * order's next dispatch look comes when its whole delivery command is delivered again. With on, a look that leaves riders
 * deciding also sends one small message to the fleet-timers queue for the time of its next check; when it arrives, the
 * stage is looked at without the command (FleetDispatcher.matchOrClose). A rider whose trip or break ended starts the same
 * look for the orders waiting near them. Nothing here offers, closes or books: the look does, by the dispatcher's own
 * rules, and where it needs the command (the deadline) the command is made due. shadow: the messages are sent and their
 * arrival logged beside the command's own loop; nothing looks. If the queue does not exist the sends fail, are reported
 * once a minute, and every order goes on by its command as with off.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetTimers {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetTimers.class);
    /** After a failed send or receive, this long before the next try or the next report. */
    private static final long BACK_OFF_MS = 60_000;
    /** Looks this replica runs at once from the queue. shortcut: fixed; make it a setting if one replica's share of 300 waiting orders ever needs more. */
    private static final int CONCURRENT_LOOKS = 4;
    /** Orders one free rider wakes at most, the ones nearest their deadline first. */
    static final int WAKES_PER_RIDER = 20;
    private static final String OPEN_FLEET_STAGE = "trip_id = ? AND provider = 'CRAVES_FLEET' AND state = 'OPEN'";
    /** A message may come this much before the stored time and still start the look (the two clocks differ a little). */
    private static final String DUE = "COALESCE(next_match_at, deadline_at) <= now() + INTERVAL '1 second'";

    private final JdbcTemplate jdbc;
    private final FleetDispatcher dispatcher;
    private final FleetPolicyStore policies;
    private final DeliveryCommandWake commandWake;
    private final String mode;
    private final AtomicLong sendsOffUntilMs = new AtomicLong();
    private final AtomicLong receiveReportedAtMs = new AtomicLong();
    /** When a receive from the queue last failed (0: never). */
    private final AtomicLong receiveFailedAtMs = new AtomicLong();
    /** Whether the queue's consumer is running; the test constructor has no consumer and counts as running. */
    private BooleanSupplier processorRunning = () -> true;
    /** Sends a trip's timer for a time; null without Service Bus. */
    private BiConsumer<UUID, Instant> sender;
    private ServiceBusSenderClient senderClient;
    private ServiceBusProcessorClient processor;

    @Autowired
    public FleetTimers(JdbcTemplate jdbc, FleetDispatcher dispatcher, FleetPolicyStore policies,
                       ObjectProvider<DeliveryCommandWake> commandWake, ObjectProvider<DeliveryServiceBusClientFactory> serviceBus,
                       @Value("${craves.fleet.timers:off}") String mode,
                       @Value("${craves.fleet.timers-queue:fleet-timers}") String queue,
                       @Value("${craves.fleet.stage-leaves-command-enabled:false}") boolean stageLeavesCommand,
                       @Value("${craves.fleet.stage-sweeper:off}") String sweeper) {
        this(jdbc, dispatcher, policies, commandWake.getIfAvailable(), null, mode, stageLeavesCommand, sweeper);
        processorRunning = () -> processor != null && processor.isRunning();
        DeliveryServiceBusClientFactory factory = serviceBus.getIfAvailable();
        if ("off".equals(this.mode) || factory == null) {
            return;
        }
        try {
            // Building a client opens no connection: a queue that does not exist yet shows on the first send or receive.
            // A send runs on a command worker or the fleet tick: a slow queue may cost it about 4 s once (two tries of 2 s),
            // then the sends stop for BACK_OFF_MS, not the SDK's default of three tries of a minute.
            senderClient = factory.newBuilder().retryOptions(new AmqpRetryOptions().setMode(AmqpRetryMode.FIXED)
                .setTryTimeout(Duration.ofSeconds(2)).setMaxRetries(1).setDelay(Duration.ofMillis(200)))
                .sender().queueName(queue).buildClient();
            sender = (tripId, at) -> {
                ServiceBusMessage message = new ServiceBusMessage(tripId + "|" + at.toEpochMilli());
                if (at.isAfter(Instant.now())) {
                    senderClient.scheduleMessage(message, at.atOffset(ZoneOffset.UTC));
                } else {
                    senderClient.sendMessage(message);
                }
            };
            processor = factory.newBuilder().processor().queueName(queue).maxConcurrentCalls(CONCURRENT_LOOKS)
                .processMessage(context -> onMessage(context.getMessage().getBody().toString()))
                .processError(context -> receiveFailed(context.getEntityPath(), context.getException()))
                .buildProcessorClient();
        } catch (RuntimeException exception) {
            LOGGER.error("CRAVES_ALERT alert=FLEET_TIMERS_NOT_STARTED error={}", exception.getClass().getSimpleName());
        }
    }

    /** For tests: sender stands in for the queue (null: no Service Bus). */
    FleetTimers(JdbcTemplate jdbc, FleetDispatcher dispatcher, FleetPolicyStore policies, DeliveryCommandWake commandWake,
                BiConsumer<UUID, Instant> sender, String mode, boolean stageLeavesCommand, String sweeper) {
        this.jdbc = jdbc;
        this.dispatcher = dispatcher;
        this.policies = policies;
        this.commandWake = commandWake;
        this.sender = sender;
        this.mode = mode(mode);
        boolean leaves = stageLeavesCommand && on() && "on".equals(FleetStageSweeper.mode(sweeper));
        if (stageLeavesCommand && !leaves) {
            // Without the timers and the sweeper nothing but the command looks: the switch stays without effect.
            LOGGER.warn("FLEET_STAGE_LEAVES_COMMAND ignored: it needs craves.fleet.timers=on and craves.fleet.stage-sweeper=on");
        }
        if (!"off".equals(this.mode)) {
            dispatcher.setTimers(this::schedule, leaves, this::receiving);
        }
    }

    /** Trimmed and lower-cased; unset or blank is off; any other value stops start-up. */
    static String mode(String value) {
        String mode = value == null || value.isBlank() ? "off" : value.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("off", "shadow", "on").contains(mode)) {
            throw new IllegalStateException("craves.fleet.timers must be off, shadow or on");
        }
        return mode;
    }

    @PostConstruct
    void start() {
        if (processor != null) {
            try {
                processor.start();
                LOGGER.info("Fleet timers started: mode={}", mode);
            } catch (RuntimeException exception) {
                LOGGER.error("CRAVES_ALERT alert=FLEET_TIMERS_NOT_STARTED error={}", exception.getClass().getSimpleName());
            }
        }
    }

    @PreDestroy
    void stop() {
        if (processor != null) {
            processor.close();
        }
        if (senderClient != null) {
            senderClient.close();
        }
    }

    /** The consumer reported a failed receive: reported at most once a minute, and receiving() is false for a minute. */
    void receiveFailed(String queue, Throwable error) {
        long now = System.currentTimeMillis();
        receiveFailedAtMs.set(now);
        long reported = receiveReportedAtMs.get();
        if (now - reported >= BACK_OFF_MS && receiveReportedAtMs.compareAndSet(reported, now)) {
            LOGGER.warn("CRAVES_ALERT alert=FLEET_TIMERS_RECEIVE_FAILED queue={} error={}", queue, error.getClass().getSimpleName());
        }
    }

    /**
     * The timers are coming back: the consumer runs and no receive failed in the last minute. Only then may the command
     * leave the fleet stage to them (CRAVES_FLEET_STAGE_LEAVES_COMMAND_ENABLED); otherwise it keeps its 5 s checks.
     */
    boolean receiving() {
        return processorRunning.getAsBoolean() && System.currentTimeMillis() - receiveFailedAtMs.get() >= BACK_OFF_MS;
    }

    public boolean on() {
        return "on".equals(mode);
    }

    /**
     * One message for a trip's next look at this time. True once it is sent. A failure is reported and the sends stop for
     * a minute, so a missing queue costs each look nothing more; the order then goes on by its command and the sweeper.
     */
    boolean schedule(UUID tripId, Instant at) {
        if (sender == null || System.currentTimeMillis() < sendsOffUntilMs.get()) {
            return false;
        }
        try {
            sender.accept(tripId, at);
            return true;
        } catch (RuntimeException exception) {
            sendsOffUntilMs.set(System.currentTimeMillis() + BACK_OFF_MS);
            LOGGER.warn("CRAVES_ALERT alert=FLEET_TIMERS_SEND_FAILED error={}", exception.getClass().getSimpleName());
            return false;
        }
    }

    /** A message's body, "<trip id>|<due, epoch ms>". Never throws: a timer that cannot be read or run is dropped, not retried. */
    void onMessage(String body) {
        try {
            int bar = body.indexOf('|');
            onTimer(UUID.fromString(body.substring(0, bar)), Instant.ofEpochMilli(Long.parseLong(body.substring(bar + 1))));
        } catch (RuntimeException exception) {
            LOGGER.warn("FLEET_TIMER_FAILED error={}", exception.getClass().getSimpleName());
        }
    }

    /**
     * A timer arrived. The stage's stored next look decides: if a look came meanwhile (the command's, another timer's) it
     * moved on, and this message is dropped, so however many messages there are, one starts a look. The claim moves the
     * stored time one check on before the look; the look then stores its own.
     */
    void onTimer(UUID tripId, Instant dueAt) {
        long lateMs = System.currentTimeMillis() - dueAt.toEpochMilli();
        if (!on()) {
            List<Boolean> due = jdbc.queryForList("SELECT " + DUE + " FROM fleet_schema.trip_stage WHERE " + OPEN_FLEET_STAGE, Boolean.class, tripId);
            if (!due.isEmpty()) {
                // due=true: the timer came before the command's own look for this time; false: the command looked first.
                LOGGER.info("FLEET_TIMER mode=shadow trip={} lateMs={} due={}", tripId, lateMs, due.get(0));
            }
            return;
        }
        if (jdbc.update("UPDATE fleet_schema.trip_stage SET next_match_at = now() + make_interval(secs => ?) WHERE " + OPEN_FLEET_STAGE
            + " AND " + DUE, FleetDispatcher.ROUND_CHECK_EVERY.toSeconds(), tripId) == 1) {
            LOGGER.info("FLEET_TIMER mode=on trip={} lateMs={}", tripId, lateMs);
            look(tripId);
        }
    }

    /**
     * One look at the trip's stage without its command. True when nothing more is needed: riders are deciding, the stage
     * is no longer open, or the command it needs was made due. False when the look failed or the command could not be
     * woken; the stage's stored time is then overdue and the sweeper comes for it.
     */
    public boolean look(UUID tripId) {
        try {
            return !FleetDispatcher.Look.COMMAND.equals(dispatcher.matchOrClose(tripId).outcome())
                || (commandWake != null && commandWake.stage(tripId));
        } catch (RuntimeException exception) {
            LOGGER.warn("FLEET_TIMER_LOOK_FAILED trip={} error={}", tripId, exception.getClass().getSimpleName());
            return false;
        }
    }

    /** Call in the transaction that ended the trip: once it commits, the orders waiting near its rider look (R22 E3). */
    public void afterTrip(UUID tripId) {
        afterCommit("(SELECT rider_id FROM fleet_schema.trip WHERE id = ?)", tripId);
    }

    /** Call in the transaction that ended the rider's break. */
    public void afterBreak(UUID identityId) {
        afterCommit("(SELECT id FROM fleet_schema.rider WHERE identity_id = ?)", identityId);
    }

    private void afterCommit(String riderSql, UUID key) {
        if ("off".equals(mode)) {
            return;
        }
        Runnable wake = () -> Thread.ofVirtual().name("fleet-rider-free").start(() -> riderFree(riderSql, key));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    wake.run();
                }
            });
        } else {
            wake.run();
        }
    }

    /**
     * The open fleet stages with nobody deciding whose kitchen is within the policy's radius of the rider's last position
     * (a box, as the candidate query's), nearest their deadline first, each looked at once. The rider is offered nothing
     * here: each order's look ranks its own riders and keeps its own gap before asking one again, so the rider hears only
     * of an order that would have asked them at its next check anyway. Returns how many stages it found. Never throws.
     */
    int riderFree(String riderSql, UUID key) {
        try {
            DispatchPolicy policy = policies.currentDispatchPolicy().orElse(null);
            if (policy == null || !"live".equals(policy.mode())) {
                return 0;
            }
            double box = policy.radiusM() / 111_320.0;
            List<UUID> trips = jdbc.queryForList("""
                SELECT s.trip_id FROM fleet_schema.trip_stage s
                JOIN fleet_schema.trip t ON t.id = s.trip_id
                JOIN fleet_schema.rider_position_latest p ON p.rider_id = %s
                WHERE s.provider = 'CRAVES_FLEET' AND s.state = 'OPEN' AND s.deadline_at > now()
                  AND t.kitchen_lat BETWEEN p.lat - ? AND p.lat + ?
                  AND t.kitchen_lng BETWEEN p.lng - ? / GREATEST(0.01, cos(radians(p.lat))) AND p.lng + ? / GREATEST(0.01, cos(radians(p.lat)))
                  AND NOT EXISTS (SELECT 1 FROM fleet_schema.trip_offer o WHERE o.trip_id = s.trip_id AND o.state = 'ACTIVE' AND o.expires_at > now())
                ORDER BY s.deadline_at LIMIT ?""".formatted(riderSql), UUID.class, key, box, box, box, box, WAKES_PER_RIDER);
            if (!trips.isEmpty()) {
                LOGGER.info("FLEET_RIDER_FREE mode={} stages={}", mode, trips.size());
            }
            if (on()) {
                trips.forEach(this::look);
            }
            return trips.size();
        } catch (RuntimeException exception) {
            LOGGER.warn("FLEET_RIDER_FREE failed: {}", exception.getClass().getSimpleName());
            return 0;
        }
    }
}
