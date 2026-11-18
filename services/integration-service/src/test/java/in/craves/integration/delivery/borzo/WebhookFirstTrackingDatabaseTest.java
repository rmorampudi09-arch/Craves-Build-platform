package in.craves.integration.delivery.borzo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.springframework.test.web.client.ExpectedCount.manyTimes;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.anything;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import in.craves.integration.LoggedEvents;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.config.BorzoProperties;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.provider.CourierApiUsage;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryLeaseRecoveryRepository;
import in.craves.integration.delivery.status.DeliveryStatusRepository;
import in.craves.integration.delivery.status.DeliveryStatusRepository.TrackingWorkItem;
import in.craves.integration.delivery.status.DeliveryStatusRepository.WebhookWorkItem;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService.ProcessingResult;
import in.craves.integration.delivery.status.DeliveryTrackingReconciliationWorker;
import in.craves.integration.fleet.FleetDatabase;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;

/**
 * CRAVES_DELIVERY_WEBHOOK_FIRST_TRACKING_ENABLED on PostgreSQL: the real tracking worker, status service and Borzo client,
 * against a stand-in for Borzo's API. Time passes by moving the jobs' stored times back, so every now() stays real.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class WebhookFirstTrackingDatabaseTest {
    private static final String BASE_URL = "https://borzo.test/api/business/1.8";
    /** A delivery of 40 minutes: the minute each Borzo delivery status begins. */
    private static final Object[][] STAGES = {{0, "planned"}, {2, "courier_assigned"}, {4, "courier_departed"}, {12, "courier_at_pickup"},
        {15, "parcel_picked_up"}, {16, "active"}, {36, "courier_arrived"}, {40, "finished"}};

    final FleetDatabase database = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final DeliveryCommandProperties properties = new DeliveryCommandProperties();
    final TransactionTemplate transaction = new TransactionTemplate(database.transactions);
    final DeliveryStatusRepository repository = new DeliveryStatusRepository(database.db, json);
    final DeliveryStatusUpdateService service = new DeliveryStatusUpdateService(List.of(new BorzoWebhookNormalizer(new BorzoStatusMapper())),
        repository, new DeliveryOutboxRepository(database.db, json), properties, json, null) {
        @Override
        public ProcessingResult processTracking(TrackingWorkItem workItem, TrackingSnapshot snapshot) {
            return transaction.execute(tx -> super.processTracking(workItem, snapshot));
        }
    };
    final LoggedEvents logged = new LoggedEvents();
    /** Borzo order id -> the delivery status Borzo answers a poll with. */
    final Map<String, String> borzo = new HashMap<>();
    int orderReads;
    int courierReads;
    DeliveryTrackingReconciliationWorker worker;

    @BeforeEach
    void setUp() {
        BorzoProperties borzoProperties = new BorzoProperties();
        borzoProperties.setEnabled(true);
        borzoProperties.setBaseUrl(BASE_URL);
        borzoProperties.setAuthToken("token");
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer.bindTo(builder).build().expect(manyTimes(), anything()).andRespond(request -> {
            String orderId = request.getURI().getQuery().replaceAll(".*order_id=([0-9]+).*", "$1");
            boolean courier = request.getURI().getPath().endsWith("/courier");
            if (courier) {
                courierReads++;
            } else {
                orderReads++;
            }
            return withSuccess(courier ? "{\"is_successful\":true,\"courier\":{\"courier_id\":7,\"name\":\"Rider\",\"phone\":\"900\"}}"
                : "{\"is_successful\":true,\"orders\":[{\"order_id\":" + orderId + ",\"status\":\"active\",\"points\":[{},{\"tracking_url\":\""
                    + trackingUrl(orderId) + "\",\"delivery\":{\"status\":\"" + borzo.get(orderId) + "\"}}]}]}", MediaType.APPLICATION_JSON)
                .createResponse(request);
        });
        properties.setTrackingBatchSize(500);
        worker = new DeliveryTrackingReconciliationWorker(List.of(new BorzoApiClient(borzoProperties, json, new BorzoStatusMapper(),
            builder.build())), repository, new DeliveryLeaseRecoveryRepository(database.db), service, properties);
        logged.start();
        ((Logger) LoggerFactory.getLogger(DeliveryStatusUpdateService.class)).addAppender(logged);
    }

    @AfterEach
    void tearDown() {
        ((Logger) LoggerFactory.getLogger(DeliveryStatusUpdateService.class)).detachAppender(logged);
    }

    @Test
    void offEveryPollIsTwoCallsAndTheNextIsAMinuteLaterAndACallbackWritesNothingNew() {
        book("1250032");
        borzo.put("1250032", "courier_assigned");

        worker.reconcile();
        callback("1250032", "courier_assigned");

        assertThat(orderReads).isEqualTo(1);
        assertThat(courierReads).isEqualTo(1);
        assertThat(secondsToNextPoll("1250032")).isCloseTo(60.0, within(5.0));
        assertThat(database.db.queryForMap("SELECT last_webhook_at, last_polled_at FROM delivery_schema.delivery_job"))
            .containsEntry("last_webhook_at", null).containsEntry("last_polled_at", null);
        assertThat(logged.list).isEmpty();
    }

    @Test
    void onAPollIsOneCallUnlessItHasNewsAboutARiderAndTheNextWaitsForTheStagesQuietPeriod() {
        properties.setWebhookFirstTrackingEnabled(true);
        book("1250032");

        worker.reconcile();
        assertThat(orderReads).as("searching, nothing new").isEqualTo(1);
        assertThat(courierReads).isZero();
        assertThat(secondsToNextPoll("1250032")).isCloseTo(120.0, within(5.0));

        borzo.put("1250032", "courier_assigned");
        pass(120);
        worker.reconcile();
        assertThat(courierReads).as("the poll saw the rider first").isEqualTo(1);
        assertThat(secondsToNextPoll("1250032")).isCloseTo(180.0, within(5.0));
        assertThat(database.db.queryForObject("SELECT payload::text FROM delivery_schema.delivery_outbox ORDER BY created_at DESC LIMIT 1",
            String.class)).contains("Rider");
        assertThat(logged.list).extracting(ILoggingEvent::getFormattedMessage)
            .anyMatch(line -> line.startsWith("DELIVERY_TRACKING_POLL_SAW_FIRST provider=borzo"));

        pass(180);
        worker.reconcile();
        assertThat(orderReads).isEqualTo(3);
        assertThat(courierReads).as("no news, no courier call").isEqualTo(1);

        borzo.put("1250032", "parcel_picked_up");
        callback("1250032", "parcel_picked_up");
        assertThat(secondsToNextPoll("1250032")).as("the callback moved the poll to the quiet period after pickup").isCloseTo(300.0, within(5.0));
        assertThat(database.db.queryForObject("SELECT last_webhook_at IS NOT NULL AND last_polled_at IS NOT NULL "
            + "FROM delivery_schema.delivery_job", Boolean.class)).isTrue();
    }

    @Test
    void onCallbacksNeverPutAPollOffForLongerThanTheSafetyPeriodAfterTheLastPoll() {
        properties.setWebhookFirstTrackingEnabled(true);
        book("1250032");
        borzo.put("1250032", "active");
        worker.reconcile();

        pass(780);
        callback("1250032", "active");
        assertThat(secondsToNextPoll("1250032")).as("900 s after the poll, not 300 s after the callback").isCloseTo(120.0, within(5.0));

        pass(60);
        callback("1250032", "active");
        assertThat(secondsToNextPoll("1250032")).as("a callback that changes nothing counts as heard").isCloseTo(60.0, within(5.0));
        assertThat(orderReads).isEqualTo(1);
    }

    @Test
    void onACallbackLeavesAFailedPollsRetryAndAFinishedJobAlone() {
        properties.setWebhookFirstTrackingEnabled(true);
        book("1250032");
        database.db.update("UPDATE delivery_schema.delivery_job SET tracking_attempt_count = 3, next_tracking_at = now() + interval '10 minutes'");

        callback("1250032", "planned");
        assertThat(secondsToNextPoll("1250032")).as("the retry delay is kept").isCloseTo(600.0, within(5.0));

        callback("1250032", "finished");
        assertThat(database.db.queryForMap("SELECT status, next_tracking_at FROM delivery_schema.delivery_job"))
            .containsEntry("status", "DELIVERED").containsEntry("next_tracking_at", null);
    }

    /** The schedule statement fails inside the callback's transaction: the courier's status is still committed. */
    @Test
    void onACallbackIsStillAppliedWhenItsScheduleStatementFails() {
        properties.setWebhookFirstTrackingEnabled(true);
        book("1250032");
        database.db.execute("ALTER TABLE delivery_schema.delivery_job RENAME COLUMN last_webhook_at TO last_webhook_at_away");
        try {
            assertThat(callback("1250032", "courier_assigned").applied()).isTrue();
        } finally {
            database.db.execute("ALTER TABLE delivery_schema.delivery_job RENAME COLUMN last_webhook_at_away TO last_webhook_at");
        }

        assertThat(database.db.queryForObject("SELECT status FROM delivery_schema.delivery_job", String.class)).isEqualTo("COURIER_ASSIGNED");
        assertThat(database.db.queryForObject("SELECT processing_status FROM delivery_schema.delivery_webhook_inbox", String.class))
            .isEqualTo("PROCESSED");
        assertThat(database.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_outbox", Integer.class)).isEqualTo(1);
        assertThat(logged.list).extracting(ILoggingEvent::getFormattedMessage)
            .filteredOn(line -> line.startsWith("DELIVERY_WEBHOOK_FIRST_TRACKING step=CALLBACK_HEARD failed")).hasSize(1);
    }

    /**
     * R23 PR-4's exit test: a simulated day of 300 Borzo deliveries stays under 4,000 Borzo calls. One delivery starts
     * every 30 s; of every five, one gets no callback at all and one loses every other callback. The worker runs every
     * 15 s as in production. Every delivery must still reach DELIVERED, within a quiet period of Borzo finishing it.
     */
    @Test
    void onASimulatedDayOf300BorzoDeliveriesStaysUnder4000BorzoCallsAndEveryDeliveryIsSeenThrough() {
        properties.setWebhookFirstTrackingEnabled(true);
        CourierApiUsage.drainCalls();
        int deliveries = 300;
        int lastTick = (deliveries - 1) * 2 + 46 * 4;

        for (int tick = 0; tick <= lastTick; tick++) {
            for (int delivery = Math.max(0, (tick - 46 * 4) / 2); delivery < deliveries && delivery * 2 <= tick; delivery++) {
                String orderId = String.valueOf(1_000_000 + delivery);
                int ticksIn = tick - delivery * 2;
                if (ticksIn == 0) {
                    book(orderId);
                }
                for (int stage = 1; stage < STAGES.length; stage++) {
                    if (ticksIn == (int) STAGES[stage][0] * 4) {
                        borzo.put(orderId, (String) STAGES[stage][1]);
                        boolean lost = delivery % 5 == 0 || (delivery % 5 == 1 && stage % 2 == 0);
                        if (!lost) {
                            callback(orderId, (String) STAGES[stage][1]);
                        }
                    }
                }
            }
            worker.reconcile();
            pass(15);
        }

        int borzoCalls = orderReads + courierReads + 2 * deliveries;
        System.out.println("webhook-first simulated day: deliveries=" + deliveries + " orderReads=" + orderReads + " courierReads=" + courierReads
            + " withQuoteAndBooking=" + borzoCalls);
        assertThat(database.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_job WHERE status = 'DELIVERED'", Integer.class))
            .as("no delivery is stranded by a lost callback").isEqualTo(deliveries);
        assertThat(borzoCalls).as("tracking calls plus a quote and a booking for each delivery").isLessThan(4000);
        assertThat(CourierApiUsage.drainCalls().get("borzo")).as("every call was counted").isEqualTo((long) orderReads + courierReads);
    }

    private void book(String orderId) {
        borzo.put(orderId, "planned");
        database.db.update("INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status, "
            + "provider_status, tracking_url, last_status_observed_at, last_status_source, next_tracking_at) "
            + "VALUES (?, ?, ?, 'borzo', ?, 'SEARCHING', 'planned', ?, now(), 'CREATE', now())", UUID.randomUUID(), UUID.randomUUID(),
            UUID.randomUUID(), orderId, trackingUrl(orderId));
    }

    private ProcessingResult callback(String orderId, String borzoStatus) {
        String at = OffsetDateTime.now(ZoneOffset.UTC).toString();
        ObjectNode payload = json.createObjectNode().put("event_type", "delivery_changed").put("event_datetime", at);
        payload.putObject("delivery").put("order_id", orderId).put("status", borzoStatus).put("status_datetime", at)
            .put("tracking_url", trackingUrl(orderId));
        UUID id = UUID.randomUUID();
        database.db.update("INSERT INTO delivery_schema.delivery_webhook_inbox (id, provider_id, provider_event_id, raw_payload) "
            + "VALUES (?, 'borzo', ?, ?::jsonb)", id, "event-" + id, payload.toString());
        return transaction.execute(tx -> service.processWebhook(new WebhookWorkItem(id, "borzo", "event-" + id, payload, 1)));
    }

    /** Lets seconds pass for every job that is still tracked. */
    private void pass(int seconds) {
        database.db.update("UPDATE delivery_schema.delivery_job SET created_at = created_at - make_interval(secs => ?), "
            + "next_tracking_at = next_tracking_at - make_interval(secs => ?), last_polled_at = last_polled_at - make_interval(secs => ?), "
            + "last_webhook_at = last_webhook_at - make_interval(secs => ?), "
            + "last_status_observed_at = last_status_observed_at - make_interval(secs => ?) WHERE next_tracking_at IS NOT NULL",
            (double) seconds, (double) seconds, (double) seconds, (double) seconds, (double) seconds);
    }

    private double secondsToNextPoll(String orderId) {
        return database.db.queryForObject("SELECT extract(epoch FROM next_tracking_at - now()) FROM delivery_schema.delivery_job "
            + "WHERE provider_delivery_id = ?", Double.class, orderId);
    }

    private static String trackingUrl(String orderId) {
        return "https://borzo.test/track/" + orderId;
    }
}
