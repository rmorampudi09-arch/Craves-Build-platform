package in.craves.integration.delivery.status;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import in.craves.integration.LoggedEvents;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.delivery.borzo.BorzoStatusMapper;
import in.craves.integration.delivery.borzo.BorzoWebhookNormalizer;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusRepository.TrackingWorkItem;
import in.craves.integration.delivery.status.DeliveryStatusRepository.WebhookWorkItem;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService.ProcessingResult;
import in.craves.integration.fleet.FleetDatabase;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * CRAVES_DELIVERY_STATUS_RANK_GUARD on PostgreSQL: the real status service, job, event, inbox and exception-case tables,
 * each update in its own transaction as in production.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class DeliveryStatusRankGuardDatabaseTest {
    final FleetDatabase database = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final DeliveryCommandProperties properties = new DeliveryCommandProperties();
    final DeliveryStatusUpdateService service = new DeliveryStatusUpdateService(List.of(new BorzoWebhookNormalizer(new BorzoStatusMapper())),
        new DeliveryStatusRepository(database.db, json), new DeliveryOutboxRepository(database.db, json), properties, json);
    final TransactionTemplate transaction = new TransactionTemplate(database.transactions);
    final LoggedEvents logged = new LoggedEvents();
    final UUID orderId = UUID.randomUUID();
    final UUID chefSubOrderId = UUID.randomUUID();
    final UUID jobId = UUID.randomUUID();
    Instant clock = Instant.now();

    @BeforeEach
    void setUp() {
        database.db.update("INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status) "
            + "VALUES (?, ?, ?, 'borzo', '1250032', 'COURIER_ASSIGNED')", jobId, chefSubOrderId, orderId);
        logged.start();
        ((Logger) LoggerFactory.getLogger(DeliveryStatusUpdateService.class)).addAppender(logged);
    }

    @AfterEach
    void tearDown() {
        ((Logger) LoggerFactory.getLogger(DeliveryStatusUpdateService.class)).detachAppender(logged);
    }

    @Test
    void offALateEarlierStageAndACourierCancelAreAppliedAsTodayWithNoLineAndNoCase() {
        poll(DeliveryStatus.PICKED_UP);

        assertThat(poll(DeliveryStatus.COURIER_ASSIGNED).applied()).isTrue();
        assertThat(poll(DeliveryStatus.CANCELLED).applied()).isTrue();

        assertThat(status()).isEqualTo("CANCELLED");
        assertThat(cases()).isZero();
        assertThat(logged.list).isEmpty();
    }

    @Test
    void shadowAppliesTheSameAndLogsOneLineForEachUpdateItWouldHaveRefusedAndEachCaseItWouldHaveOpened() {
        properties.setStatusRankGuard("shadow");
        poll(DeliveryStatus.PICKED_UP);

        assertThat(poll(DeliveryStatus.COURIER_ASSIGNED).result()).isEqualTo("APPLIED");
        assertThat(status()).isEqualTo("COURIER_ASSIGNED");
        assertThat(poll(DeliveryStatus.CANCELLED).applied()).isTrue();

        assertThat(cases()).isZero();
        assertThat(lines()).hasSize(2);
        assertThat(lines().get(0)).startsWith("DELIVERY_STATUS_RANK_GUARD mode=shadow decision=STALE_RANK source=TRACK provider=borzo jobId=" + jobId
            + " delivery=1250032 from=PICKED_UP to=COURIER_ASSIGNED");
        assertThat(lines().get(1)).startsWith("DELIVERY_STATUS_RANK_GUARD mode=shadow decision=COURIER_ENDED source=TRACK provider=borzo");
    }

    @Test
    void enforceRefusesALateEarlierStageFromAPollAndFromACallbackAndKeepsTheCallbackAsIgnored() {
        properties.setStatusRankGuard("enforce");
        poll(DeliveryStatus.PICKED_UP);

        ProcessingResult polled = poll(DeliveryStatus.COURIER_ASSIGNED);
        ProcessingResult called = callback("courier_assigned");

        assertThat(polled.applied()).isFalse();
        assertThat(polled.result()).isEqualTo("STALE_RANK");
        assertThat(called.result()).isEqualTo("STALE_RANK");
        assertThat(status()).isEqualTo("PICKED_UP");
        assertThat(database.db.queryForList("SELECT applied, ignored_reason, source FROM delivery_schema.delivery_event WHERE normalized_status = "
            + "'COURIER_ASSIGNED'")).containsExactly(Map.of("applied", false, "ignored_reason", "STALE_RANK", "source", "WEBHOOK"));
        assertThat(database.db.queryForObject("SELECT processing_result FROM delivery_schema.delivery_webhook_inbox", String.class))
            .isEqualTo("STALE_RANK");
        assertThat(lines()).hasSize(2).allMatch(line -> line.contains("mode=enforce decision=STALE_RANK"));
        assertThat(poll(DeliveryStatus.IN_TRANSIT).applied()).as("forward still applies").isTrue();
    }

    @Test
    void enforceKeepsThePickupBoundaryForADelayedJobAndAllowsASearchAgainBeforePickup() {
        properties.setStatusRankGuard("enforce");

        assertThat(poll(DeliveryStatus.SEARCHING).applied()).as("the courier dropped the job before pickup").isTrue();
        poll(DeliveryStatus.PICKED_UP);
        poll(DeliveryStatus.DELAYED);

        assertThat(poll(DeliveryStatus.SEARCHING).result()).isEqualTo("STALE_RANK");
        assertThat(status()).isEqualTo("DELAYED");
        assertThat(poll(DeliveryStatus.IN_TRANSIT).applied()).isTrue();
    }

    /** R23 PR-3: a courier-side CANCELLED opens one case and one page. */
    @Test
    void enforceOpensOneCaseAndAlertsOnceWhenTheCourierCancelsABookingCravesDidNot() {
        properties.setStatusRankGuard("enforce");
        poll(DeliveryStatus.PICKED_UP);

        assertThat(poll(DeliveryStatus.CANCELLED).applied()).isTrue();
        // The same end again, as a callback with the courier's own wording.
        callback("canceled");

        assertThat(status()).isEqualTo("CANCELLED");
        assertThat(database.db.queryForList("SELECT delivery_job_id, order_id, reason, status, opened_by FROM delivery_schema.delivery_exception_case"))
            .containsExactly(Map.of("delivery_job_id", jobId, "order_id", orderId, "reason", "PROVIDER_CANCELLED", "status", "OPEN",
                "opened_by", DeliveryStatusRepository.SYSTEM_ACTOR));
        assertThat(database.db.queryForObject("SELECT note FROM delivery_schema.delivery_exception_event WHERE action = 'OPEN'", String.class))
            .isEqualTo("borzo ended booking 1250032 as CANCELLED while it was PICKED_UP");
        assertThat(alerts()).hasSize(1);
        assertThat(alerts().get(0)).contains("alert=COURIER_ENDED_DELIVERY provider=borzo orderId=" + orderId).contains("delivery=1250032")
            .contains("was=PICKED_UP status=CANCELLED");
    }

    @Test
    void enforceOpensNoCaseWhenCravesCancelledTheBookingOrTheOrderIsCancelledOrACaseIsAlreadyOpen() {
        properties.setStatusRankGuard("enforce");
        database.db.update("INSERT INTO delivery_schema.courier_cancel (provider_id, provider_delivery_id, chef_sub_order_id, reason) "
            + "VALUES ('borzo', '1250032', ?, 'OPS_CANCELLED')", chefSubOrderId);
        poll(DeliveryStatus.CANCELLED);
        assertThat(cases()).as("Craves cancelled it").isZero();

        database.db.update("DELETE FROM delivery_schema.courier_cancel");
        database.db.update("INSERT INTO delivery_schema.order_cancelled (chef_sub_order_id, reason, cancelled_at) VALUES (?, 'customer', now())",
            chefSubOrderId);
        revive();
        poll(DeliveryStatus.FAILED);
        assertThat(cases()).as("the order is cancelled").isZero();

        database.db.update("DELETE FROM delivery_schema.order_cancelled");
        database.db.update("INSERT INTO delivery_schema.delivery_exception_case (id, delivery_job_id, order_id, reason, status, opened_by) "
            + "VALUES (?, ?, ?, 'RIDER_UNREACHABLE', 'OPEN', ?)", UUID.randomUUID(), jobId, orderId, UUID.randomUUID());
        revive();
        poll(DeliveryStatus.FAILED);
        assertThat(cases()).as("ops already has a case for this delivery").isEqualTo(1);
        assertThat(alerts()).isEmpty();
    }

    /** The guard's own statement fails inside the status transaction: the courier's status is still committed. */
    @Test
    void shadowStillCommitsTheStatusWhenAGuardStatementFails() {
        properties.setStatusRankGuard("shadow");
        database.db.execute("ALTER TABLE delivery_schema.courier_cancel RENAME TO courier_cancel_away");

        assertThat(poll(DeliveryStatus.CANCELLED).applied()).isTrue();

        assertThat(status()).isEqualTo("CANCELLED");
        assertThat(database.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_event WHERE normalized_status = 'CANCELLED' "
            + "AND applied", Integer.class)).isEqualTo(1);
        assertThat(database.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_outbox", Integer.class)).isEqualTo(1);
        assertThat(lines()).hasSize(1);
        assertThat(lines().get(0)).startsWith("DELIVERY_STATUS_RANK_GUARD mode=shadow decision=GUARD_FAILED step=CRAVES_ENDED_READ jobId=" + jobId);
    }

    @Test
    void enforceStillCommitsTheStatusWhenOpeningTheCaseFailsAndLeavesNoHalfOpenedCase() {
        properties.setStatusRankGuard("enforce");
        database.db.execute("ALTER TABLE delivery_schema.delivery_exception_event RENAME TO delivery_exception_event_away");

        assertThat(callback("canceled").applied()).isTrue();

        assertThat(status()).isEqualTo("CANCELLED");
        assertThat(database.db.queryForObject("SELECT processing_status FROM delivery_schema.delivery_webhook_inbox", String.class))
            .isEqualTo("PROCESSED");
        assertThat(cases()).as("the case insert is undone with its failed history row").isZero();
        assertThat(alerts()).isEmpty();
        assertThat(lines()).filteredOn(line -> line.contains("decision=GUARD_FAILED")).hasSize(1)
            .allMatch(line -> line.contains("mode=enforce decision=GUARD_FAILED step=CASE_OPEN jobId=" + jobId));
    }

    private void revive() {
        database.db.update("UPDATE delivery_schema.delivery_job SET status = 'COURIER_ASSIGNED' WHERE id = ?", jobId);
    }

    private ProcessingResult poll(DeliveryStatus status) {
        clock = clock.plusSeconds(1);
        TrackingSnapshot snapshot = new TrackingSnapshot(new ProviderDelivery("borzo", "1250032", null, status, status.name().toLowerCase(),
            null, null, null, null, clock), null, clock);
        return transaction.execute(tx -> service.processTracking(new TrackingWorkItem(jobId, orderId, chefSubOrderId, "borzo", "1250032", 0),
            snapshot));
    }

    private ProcessingResult callback(String borzoStatus) {
        clock = clock.plusSeconds(1);
        String at = OffsetDateTime.ofInstant(clock, java.time.ZoneOffset.UTC).toString();
        ObjectNode payload = json.createObjectNode().put("event_type", "delivery_changed").put("event_datetime", at);
        payload.putObject("delivery").put("order_id", "1250032").put("status", borzoStatus).put("status_datetime", at);
        UUID id = UUID.randomUUID();
        database.db.update("INSERT INTO delivery_schema.delivery_webhook_inbox (id, provider_id, provider_event_id, raw_payload) "
            + "VALUES (?, 'borzo', ?, ?::jsonb)", id, "event-" + id, payload.toString());
        return transaction.execute(tx -> service.processWebhook(new WebhookWorkItem(id, "borzo", "event-" + id, payload, 1)));
    }

    private String status() {
        return database.db.queryForObject("SELECT status FROM delivery_schema.delivery_job WHERE id = ?", String.class, jobId);
    }

    private int cases() {
        return database.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_exception_case", Integer.class);
    }

    private List<String> lines() {
        return logged.list.stream().map(ILoggingEvent::getFormattedMessage).filter(line -> line.startsWith("DELIVERY_STATUS_RANK_GUARD")).toList();
    }

    private List<String> alerts() {
        return logged.list.stream().map(ILoggingEvent::getFormattedMessage).filter(line -> line.startsWith("CRAVES_ALERT")).toList();
    }
}
