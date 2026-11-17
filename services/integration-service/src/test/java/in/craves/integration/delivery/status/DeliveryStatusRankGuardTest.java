package in.craves.integration.delivery.status;

import static in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.AT_DROPOFF;
import static in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.AT_PICKUP;
import static in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.CANCELLED;
import static in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.COURIER_ASSIGNED;
import static in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.COURIER_TO_PICKUP;
import static in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.DELAYED;
import static in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.DELIVERED;
import static in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.IN_TRANSIT;
import static in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.PENDING;
import static in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.PICKED_UP;
import static in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.RETURNING;
import static in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.SEARCHING;
import static in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.UNKNOWN;
import static in.craves.integration.delivery.status.DeliveryStatusUpdateService.backwards;
import static in.craves.integration.delivery.status.DeliveryStatusUpdateService.rank;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusRepository.DeliveryJobState;
import in.craves.integration.delivery.status.DeliveryStatusRepository.TrackingWorkItem;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.test.util.ReflectionTestUtils;

/** CRAVES_DELIVERY_STATUS_RANK_GUARD: the rank table, and the real status service over an in-memory job. */
class DeliveryStatusRankGuardTest {
    static final List<DeliveryStatus> TRIP = List.of(SEARCHING, COURIER_ASSIGNED, COURIER_TO_PICKUP, AT_PICKUP, PICKED_UP,
        IN_TRANSIT, AT_DROPOFF, DELIVERED);
    final UUID jobId = UUID.randomUUID();
    final DeliveryCommandProperties properties = new DeliveryCommandProperties();
    final Job job = new Job();
    final DeliveryStatusUpdateService service = new DeliveryStatusUpdateService(List.of(), job, mock(DeliveryOutboxRepository.class),
        properties, new ObjectMapper().findAndRegisterModules());
    Instant clock = Instant.parse("2026-11-17T06:00:00Z");

    /** The shuffles would log tens of thousands of guard lines. */
    @BeforeEach
    void quiet() {
        ((Logger) LoggerFactory.getLogger(DeliveryStatusUpdateService.class)).setLevel(Level.OFF);
    }

    @AfterEach
    void loud() {
        ((Logger) LoggerFactory.getLogger(DeliveryStatusUpdateService.class)).setLevel(null);
    }

    @Test
    void anEarlierStageIsBackwardsExceptASearchBeforePickup() {
        assertThat(backwards(PICKED_UP, false, COURIER_ASSIGNED)).isTrue();
        assertThat(backwards(IN_TRANSIT, false, PICKED_UP)).isTrue();
        assertThat(backwards(AT_DROPOFF, false, IN_TRANSIT)).isTrue();
        assertThat(backwards(RETURNING, false, AT_DROPOFF)).isTrue();
        assertThat(backwards(AT_PICKUP, false, COURIER_TO_PICKUP)).isTrue();
        assertThat(backwards(SEARCHING, false, PENDING)).isTrue();
        // The courier dropped the job and the provider searches again, or names another rider: only before pickup.
        for (DeliveryStatus assigned : List.of(COURIER_ASSIGNED, COURIER_TO_PICKUP, AT_PICKUP)) {
            assertThat(backwards(assigned, false, SEARCHING)).isFalse();
            assertThat(backwards(assigned, false, PENDING)).isFalse();
            assertThat(backwards(assigned, false, COURIER_ASSIGNED)).isFalse();
        }
        for (DeliveryStatus after : List.of(PICKED_UP, IN_TRANSIT, AT_DROPOFF, RETURNING)) {
            assertThat(backwards(after, false, SEARCHING)).isTrue();
            assertThat(backwards(after, false, PENDING)).isTrue();
            assertThat(backwards(after, false, COURIER_ASSIGNED)).isTrue();
        }
        for (DeliveryStatus status : DeliveryStatus.values()) {
            assertThat(backwards(status, true, DELAYED)).as("DELAYED is not a stage").isFalse();
            assertThat(backwards(status, true, status)).isFalse();
            if (rank(status) < 100) {
                assertThat(backwards(status, true, CANCELLED)).as("a final status lands").isFalse();
            }
        }
        // A DELAYED job has no stage of its own: only the pickup boundary is kept.
        assertThat(backwards(DELAYED, false, COURIER_ASSIGNED)).isFalse();
        assertThat(backwards(DELAYED, true, COURIER_ASSIGNED)).isTrue();
        assertThat(backwards(DELAYED, true, PICKED_UP)).isFalse();
        assertThat(backwards(UNKNOWN, false, PENDING)).isFalse();
    }

    @Test
    void theFlagAcceptsOnlyItsThreeValuesAndIsOffByDefault() {
        assertThat(properties.getStatusRankGuard()).isEqualTo("off");
        properties.setStatusRankGuard("on");
        assertThatThrownBy(() -> ReflectionTestUtils.invokeMethod(properties, "validate")).hasMessageContaining("statusRankGuard");
    }

    @Test
    void theFlagIsReadTrimmedAndInAnyCaseAndBlankIsOff() {
        for (String off : new String[] {"", "  ", null, "OFF", "off "}) {
            properties.setStatusRankGuard(off);
            assertThat(properties.getStatusRankGuard()).as("[%s]", off).isEqualTo("off");
            ReflectionTestUtils.invokeMethod(properties, "validate");
        }
        properties.setStatusRankGuard(" Shadow");
        assertThat(properties.getStatusRankGuard()).isEqualTo("shadow");
        properties.setStatusRankGuard("ENFORCE ");
        assertThat(properties.getStatusRankGuard()).isEqualTo("enforce");
        ReflectionTestUtils.invokeMethod(properties, "validate");
    }

    @Test
    void enforceAppliesAnUpdateAsTodayWhenTheGuardsOwnReadFails() {
        properties.setStatusRankGuard("enforce");
        job.reset();
        poll(PICKED_UP);
        poll(DELAYED);
        job.broken = true;

        assertThat(poll(COURIER_ASSIGNED).result()).isEqualTo("APPLIED");
        assertThat(job.status).isEqualTo("COURIER_ASSIGNED");
    }

    /** A provider that gives the job to another rider before pickup reports COURIER_ASSIGNED again. */
    @Test
    void enforceAppliesANewRiderBeforePickupAndRefusesOneAfterPickup() {
        properties.setStatusRankGuard("enforce");
        job.reset();
        poll(COURIER_ASSIGNED);
        poll(AT_PICKUP);

        assertThat(poll(COURIER_ASSIGNED).applied()).isTrue();
        assertThat(job.status).isEqualTo("COURIER_ASSIGNED");
        poll(PICKED_UP);
        assertThat(poll(COURIER_ASSIGNED).result()).isEqualTo("STALE_RANK");
        assertThat(job.status).isEqualTo("PICKED_UP");
    }

    @Test
    void offAndShadowApplyALateEarlierStageAsTodayAndEnforceRefusesIt() {
        for (String mode : List.of("off", "shadow", "enforce")) {
            properties.setStatusRankGuard(mode);
            job.reset();
            poll(PICKED_UP);
            var result = poll(COURIER_ASSIGNED);
            boolean enforce = mode.equals("enforce");
            assertThat(result.applied()).as(mode).isEqualTo(!enforce);
            assertThat(result.result()).as(mode).isEqualTo(enforce ? "STALE_RANK" : "APPLIED");
            assertThat(job.status).as(mode).isEqualTo(enforce ? "PICKED_UP" : "COURIER_ASSIGNED");
            if (mode.equals("off")) {
                poll(DELAYED);
                poll(CANCELLED);
                assertThat(job.rankReads + job.cancelReads).as("off reads nothing new").isZero();
            }
        }
        assertThat(job.rankReads + job.cancelReads).isZero();
        poll(DELAYED);
        poll(COURIER_ASSIGNED);
        poll(CANCELLED);
        assertThat(job.rankReads).as("a DELAYED job's pickup is read for each update").isEqualTo(2);
        assertThat(job.cancelReads).isEqualTo(1);
        assertThat(job.status).isEqualTo("CANCELLED");
    }

    /** R23 PR-3: 10,000 seeded shuffles of a trip, with duplicates, re-matches and delays, each stamped on arrival like a poll. */
    @Test
    void underEnforceShuffledUpdatesNeverMoveAJobBackAcrossPickupAndFinalStatesAbsorb() {
        properties.setStatusRankGuard("enforce");
        Random random = new Random(23);
        for (int run = 0; run < 10_000; run++) {
            boolean plain = run % 2 == 0;
            List<DeliveryStatus> events = events(random, plain);
            job.reset();
            int reached = 0;
            for (DeliveryStatus event : events) {
                String before = job.status;
                poll(event);
                DeliveryStatus now = DeliveryStatus.valueOf(job.status);
                if (rank(DeliveryStatus.valueOf(before)) == 100) {
                    assertThat(job.status).as("final is final, run %s %s", run, events).isEqualTo(before);
                }
                if (reached >= rank(PICKED_UP)) {
                    assertThat(now == DELAYED || rank(now) >= rank(PICKED_UP)).as("back across pickup, run %s %s", run, events).isTrue();
                }
                if (plain && rank(now) < rank(DeliveryStatus.valueOf(before))) {
                    assertThat(rank(DeliveryStatus.valueOf(before))).as("backwards, run %s %s", run, events)
                        .isBetween(rank(COURIER_ASSIGNED), rank(AT_PICKUP));
                    assertThat(now).as("backwards, run %s %s", run, events).isIn(SEARCHING, COURIER_ASSIGNED);
                }
                reached = Math.max(reached, rank(now));
            }
            DeliveryStatus furthest = events.stream().max((a, b) -> Integer.compare(rank(a), rank(b))).orElseThrow();
            if (plain && rank(furthest) >= rank(PICKED_UP)) {
                assertThat(job.status).as("run %s %s", run, events).isEqualTo(furthest.name());
            }
        }
    }

    /** The same shuffles without enforce end on an earlier stage: shadow changes nothing. */
    @Test
    void underShadowTheSameShufflesStillEndOnAnEarlierStage() {
        properties.setStatusRankGuard("shadow");
        Random random = new Random(23);
        int earlier = 0;
        for (int run = 0; run < 500; run++) {
            List<DeliveryStatus> events = events(random, true);
            job.reset();
            int reached = 0;
            for (DeliveryStatus event : events) {
                poll(event);
                reached = Math.max(reached, rank(DeliveryStatus.valueOf(job.status)));
            }
            earlier += rank(DeliveryStatus.valueOf(job.status)) < reached ? 1 : 0;
        }
        assertThat(earlier).isPositive();
    }

    /** A trip cut at a random stage, some stages repeated, shuffled; not plain: also a search again before pickup and delays. */
    private static List<DeliveryStatus> events(Random random, boolean plain) {
        List<DeliveryStatus> events = new ArrayList<>(TRIP.subList(0, 2 + random.nextInt(TRIP.size() - 1)));
        for (int extra = random.nextInt(4); extra > 0; extra--) {
            events.add(events.get(random.nextInt(events.size())));
        }
        if (!plain) {
            events.add(SEARCHING);
            events.add(DELAYED);
            events.add(random.nextBoolean() ? DELAYED : PENDING);
        }
        Collections.shuffle(events, random);
        return events;
    }

    private DeliveryStatusUpdateService.ProcessingResult poll(DeliveryStatus status) {
        clock = clock.plusSeconds(1);
        return service.processTracking(new TrackingWorkItem(jobId, jobId, jobId, "borzo", "1250032", 0), new TrackingSnapshot(
            new ProviderDelivery("borzo", "1250032", null, status, status.name().toLowerCase(), null, null, null, null, clock), null, clock));
    }

    /** The job row, in memory. */
    final class Job extends DeliveryStatusRepository {
        String status;
        Instant observedAt;
        boolean pickedUp;
        boolean broken;
        int rankReads;
        int cancelReads;

        Job() {
            super(null, null);
        }

        void reset() {
            status = "PENDING";
            observedAt = null;
            pickedUp = false;
        }

        @Override
        public Optional<DeliveryJobState> lockJob(UUID id) {
            return Optional.of(new DeliveryJobState(id, id, id, "borzo", "1250032", status, status.toLowerCase(), null, observedAt));
        }

        @Override
        public boolean insertEventIfAbsent(UUID id, String provider, String eventId, String type, String source, String normalized,
                                           String providerStatus, JsonNode payload, Instant at, boolean applied, String ignored) {
            return true;
        }

        @Override
        public void applyJobStatus(UUID id, String normalized, String providerStatus, String trackingUrl, Instant at, String source,
                                   Instant next) {
            status = normalized;
            observedAt = at;
            pickedUp |= List.of("PICKED_UP", "IN_TRANSIT", "AT_DROPOFF", "DELIVERED").contains(normalized);
        }

        @Override
        public void markTrackingNoChange(UUID id, Instant next) {
        }

        @Override
        public <T> T inSavepoint(java.util.function.Supplier<T> statements) {
            return statements.get();
        }

        @Override
        public boolean pickedUp(UUID id) {
            if (broken) {
                throw new IllegalStateException("picked_up_at cannot be read");
            }
            rankReads++;
            return pickedUp;
        }

        @Override
        public boolean cravesEndedBooking(String provider, String delivery, UUID chefSubOrderId) {
            cancelReads++;
            return true;
        }
    }
}
