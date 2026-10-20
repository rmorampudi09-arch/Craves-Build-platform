package in.craves.order.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import in.craves.order.delivery.DeliveryStatusModels.DeliveryStatusChangedData;
import in.craves.order.delivery.DeliveryStatusModels.EventEnvelope;
import in.craves.order.delivery.DeliveryStatusUpdateService.DeliveryStatusNonRetryableException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class DeliveryStatusHandoffTest {
    private static final Instant BORZO_OBSERVED_AT = Instant.parse("2026-10-02T10:00:00Z");
    private static final Instant PIDGE_OBSERVED_AT = BORZO_OBSERVED_AT.plusSeconds(121);

    private final UUID checkoutId = UUID.randomUUID();
    private final UUID chefSubOrderId = UUID.randomUUID();
    private final UUID deliveryJobId = UUID.randomUUID();
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final DeliveryStatusCustomerNotificationService notifications =
        mock(DeliveryStatusCustomerNotificationService.class);
    private final DeliveryStatusUpdateService service = new DeliveryStatusUpdateService(
        jdbc, new DeliveryStatusEventValidator(), new DeliveryStatusTransitionPolicy(), notifications);

    @Test
    void replacesOnlyTheProviderOfTheSameUnassignedDeliveryJob() throws Exception {
        project("borzo", "borzo-order-1", "SEARCHING", BORZO_OBSERVED_AT);

        var result = service.accept(handoff("borzo-order-1", PIDGE_OBSERVED_AT), "{}");

        assertThat(result.applied()).isTrue();
        assertThat(result.result()).isEqualTo("PROCESSED");
        verify(jdbc).update(contains("SET delivery_job_id = ?"),
            eq(deliveryJobId), eq("pidge"), eq("pidge-order-2"), eq("SEARCHING"),
            eq(null), eq(Timestamp.from(PIDGE_OBSERVED_AT)), any(UUID.class), eq(chefSubOrderId));
        verify(jdbc).update(contains("order_delivery_status_history"),
            any(UUID.class), eq(chefSubOrderId), eq(deliveryJobId), any(UUID.class),
            eq("SEARCHING"), eq("SEARCHING"), eq("pidge"), eq("pidge-order-2"),
            eq(null), eq(Timestamp.from(PIDGE_OBSERVED_AT)), eq("integration-service"));
        verifyNoInteractions(notifications);
    }

    @Test
    void rejectsHandoffIfBorzoIdentityDiffersOrCourierWasAlreadyAssigned() throws Exception {
        project("borzo", "borzo-order-1", "SEARCHING", BORZO_OBSERVED_AT);
        assertThatThrownBy(() -> service.accept(handoff("other-borzo-order", PIDGE_OBSERVED_AT), "{}"))
            .isInstanceOf(DeliveryStatusNonRetryableException.class)
            .hasMessageContaining("unassigned Borzo");
        verify(jdbc, never()).update(contains("SET delivery_job_id = ?"), any(Object[].class));

        project("borzo", "borzo-order-1", "COURIER_ASSIGNED", BORZO_OBSERVED_AT);
        assertThatThrownBy(() -> service.accept(handoff("borzo-order-1", PIDGE_OBSERVED_AT), "{}"))
            .isInstanceOf(DeliveryStatusNonRetryableException.class)
            .hasMessageContaining("unassigned Borzo");
        verify(jdbc, never()).update(contains("SET delivery_job_id = ?"), any(Object[].class));
    }

    @Test
    void rejectsHandoffForADifferentLogicalDeliveryJob() throws Exception {
        project("borzo", "borzo-order-1", "SEARCHING", BORZO_OBSERVED_AT);
        DeliveryStatusChangedData wrongJob = new DeliveryStatusChangedData(
            UUID.randomUUID(), checkoutId, chefSubOrderId, "pidge", "pidge-order-2",
            "SEARCHING", null, PIDGE_OBSERVED_AT, "borzo", "borzo-order-1");

        assertThatThrownBy(() -> service.accept(envelope(wrongJob), "{}"))
            .isInstanceOf(DeliveryStatusNonRetryableException.class)
            .hasMessageContaining("job identifier changed");
        verify(jdbc, never()).update(contains("SET delivery_job_id = ?"), any(Object[].class));
    }

    @Test
    void buffersHandoffThenAppliesItWhenInitialBorzoProjectionArrives() throws Exception {
        ResultSet missing = row(null, null, null, null);
        ResultSet borzoProjected = row("borzo", "borzo-order-1", "DELAYED",
            BORZO_OBSERVED_AT);
        AtomicInteger locks = new AtomicInteger();
        when(jdbc.query(contains("FROM order_schema.customer_order"),
            any(RowMapper.class), eq(chefSubOrderId)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                ResultSet state = locks.incrementAndGet() <= 2 ? missing : borzoProjected;
                return List.of(mapper.mapRow(state, 0));
            });
        when(jdbc.update(any(String.class), any(Object[].class))).thenReturn(1);
        EventEnvelope<DeliveryStatusChangedData> event = handoff(
            "borzo-order-1", PIDGE_OBSERVED_AT);
        String payload = new ObjectMapper().findAndRegisterModules().writeValueAsString(event);
        ResultSet waiting = mock(ResultSet.class);
        when(waiting.getObject("event_id", UUID.class)).thenReturn(event.eventId());
        when(waiting.getString("raw_payload")).thenReturn(payload);
        when(jdbc.query(contains("WAITING_FOR_PRIOR_PROVIDER"), any(RowMapper.class),
            eq(chefSubOrderId), eq(deliveryJobId)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                return List.of(mapper.mapRow(waiting, 0));
            });

        var buffered = service.accept(event, payload);
        assertThat(buffered.applied()).isFalse();
        assertThat(buffered.result()).isEqualTo("WAITING_FOR_PRIOR_PROVIDER");
        verify(jdbc).update(contains("SET processing_status = 'WAITING_FOR_PRIOR_PROVIDER'"),
            eq(event.eventId()));
        verify(jdbc, never()).update(contains("SET delivery_job_id = ?"), any(Object[].class));

        EventEnvelope<DeliveryStatusChangedData> initialBorzo = envelope(
            new DeliveryStatusChangedData(deliveryJobId, checkoutId, chefSubOrderId,
                "borzo", "borzo-order-1", "DELAYED", null, BORZO_OBSERVED_AT));
        assertThat(service.accept(initialBorzo, "{}").applied()).isTrue();
        verify(jdbc, times(2)).update(contains("SET delivery_job_id = ?"),
            any(Object[].class));
        verify(jdbc).update(contains("SET delivery_job_id = ?"),
            eq(deliveryJobId), eq("pidge"), eq("pidge-order-2"), eq("SEARCHING"),
            eq(null), eq(Timestamp.from(PIDGE_OBSERVED_AT)), eq(event.eventId()),
            eq(chefSubOrderId));
    }

    @Test
    void buffersOrdinaryPidgeStatusAgainstBorzoAndDrainsAfterMatchingHandoff() throws Exception {
        ResultSet borzo = row("borzo", "borzo-order-1", "SEARCHING", BORZO_OBSERVED_AT);
        ResultSet pidge = row("pidge", "pidge-order-2", "SEARCHING", PIDGE_OBSERVED_AT);
        AtomicInteger locks = new AtomicInteger();
        when(jdbc.query(contains("FROM order_schema.customer_order"),
            any(RowMapper.class), eq(chefSubOrderId)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                return List.of(mapper.mapRow(locks.incrementAndGet() <= 2 ? borzo : pidge, 0));
            });
        when(jdbc.update(any(String.class), any(Object[].class))).thenReturn(1);
        EventEnvelope<DeliveryStatusChangedData> pidgeStatus = envelope(
            new DeliveryStatusChangedData(deliveryJobId, checkoutId, chefSubOrderId,
                "pidge", "pidge-order-2", "COURIER_ASSIGNED", null,
                PIDGE_OBSERVED_AT.plusSeconds(5)));
        String payload = new ObjectMapper().findAndRegisterModules()
            .writeValueAsString(pidgeStatus);
        ResultSet waiting = mock(ResultSet.class);
        when(waiting.getObject("event_id", UUID.class)).thenReturn(pidgeStatus.eventId());
        when(waiting.getString("raw_payload")).thenReturn(payload);
        when(jdbc.query(contains("WAITING_FOR_HANDOFF"), any(RowMapper.class),
            eq(chefSubOrderId), eq(deliveryJobId)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                return List.of(mapper.mapRow(waiting, 0));
            });

        assertThat(service.accept(pidgeStatus, payload).result())
            .isEqualTo("WAITING_FOR_HANDOFF");
        verify(jdbc).update(contains("SET processing_status = 'WAITING_FOR_HANDOFF'"),
            eq(pidgeStatus.eventId()));
        verify(jdbc, never()).update(contains("SET delivery_job_id = ?"), any(Object[].class));

        assertThat(service.accept(handoff("borzo-order-1", PIDGE_OBSERVED_AT), "{}")
            .applied()).isTrue();
        verify(jdbc, times(2)).update(contains("SET delivery_job_id = ?"),
            any(Object[].class));
        verify(jdbc).update(contains("SET delivery_job_id = ?"),
            eq(deliveryJobId), eq("pidge"), eq("pidge-order-2"),
            eq("COURIER_ASSIGNED"), eq(null),
            eq(Timestamp.from(PIDGE_OBSERVED_AT.plusSeconds(5))),
            eq(pidgeStatus.eventId()), eq(chefSubOrderId));
    }

    @Test
    void buffersMarkedPidgeContinuationBeforeBothHandoffAndInitialBorzoProjection()
        throws Exception {
        ResultSet missing = row(null, null, null, null);
        ResultSet borzo = row("borzo", "borzo-order-1", "SEARCHING", BORZO_OBSERVED_AT);
        ResultSet pidge = row("pidge", "pidge-order-2", "SEARCHING", PIDGE_OBSERVED_AT);
        AtomicInteger locks = new AtomicInteger();
        when(jdbc.query(contains("FROM order_schema.customer_order"),
            any(RowMapper.class), eq(chefSubOrderId)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                int call = locks.incrementAndGet();
                return List.of(mapper.mapRow(call <= 3 ? missing : call == 4 ? borzo : pidge, 0));
            });
        when(jdbc.update(any(String.class), any(Object[].class))).thenReturn(1);
        EventEnvelope<DeliveryStatusChangedData> continuation = envelope(
            new DeliveryStatusChangedData(deliveryJobId, checkoutId, chefSubOrderId,
                "pidge", "pidge-order-2", "COURIER_ASSIGNED", null,
                PIDGE_OBSERVED_AT.plusSeconds(5), "borzo", "borzo-order-1", true));
        EventEnvelope<DeliveryStatusChangedData> handoff =
            handoff("borzo-order-1", PIDGE_OBSERVED_AT);
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        String continuationPayload = mapper.writeValueAsString(continuation);
        String handoffPayload = mapper.writeValueAsString(handoff);
        ResultSet waitingHandoff = mock(ResultSet.class);
        when(waitingHandoff.getObject("event_id", UUID.class)).thenReturn(handoff.eventId());
        when(waitingHandoff.getString("raw_payload")).thenReturn(handoffPayload);
        when(jdbc.query(contains("WAITING_FOR_PRIOR_PROVIDER"), any(RowMapper.class),
            eq(chefSubOrderId), eq(deliveryJobId)))
            .thenAnswer(invocation -> {
                RowMapper<?> rowMapper = invocation.getArgument(1);
                return List.of(rowMapper.mapRow(waitingHandoff, 0));
            });
        ResultSet waitingPidge = mock(ResultSet.class);
        when(waitingPidge.getObject("event_id", UUID.class)).thenReturn(continuation.eventId());
        when(waitingPidge.getString("raw_payload")).thenReturn(continuationPayload);
        when(jdbc.query(contains("WAITING_FOR_HANDOFF"), any(RowMapper.class),
            eq(chefSubOrderId), eq(deliveryJobId)))
            .thenAnswer(invocation -> {
                RowMapper<?> rowMapper = invocation.getArgument(1);
                return List.of(rowMapper.mapRow(waitingPidge, 0));
            });
        when(jdbc.queryForObject(contains("coalesce(i.payload"), eq(Boolean.class),
            eq(chefSubOrderId), eq(deliveryJobId), eq("pidge-order-2"),
            eq("pidge-order-2"), eq("borzo-order-1"))).thenReturn(true);

        assertThat(service.accept(continuation, continuationPayload).result())
            .isEqualTo("WAITING_FOR_HANDOFF");
        assertThat(service.accept(handoff, handoffPayload).result())
            .isEqualTo("WAITING_FOR_PRIOR_PROVIDER");
        EventEnvelope<DeliveryStatusChangedData> initialBorzo = envelope(
            new DeliveryStatusChangedData(deliveryJobId, checkoutId, chefSubOrderId,
                "borzo", "borzo-order-1", "SEARCHING", null, BORZO_OBSERVED_AT));
        assertThat(service.accept(initialBorzo, "{}").applied()).isTrue();

        verify(jdbc, times(3)).update(contains("SET delivery_job_id = ?"),
            any(Object[].class));
        verify(jdbc).update(contains("SET delivery_job_id = ?"),
            eq(deliveryJobId), eq("pidge"), eq("pidge-order-2"),
            eq("COURIER_ASSIGNED"), eq(null),
            eq(Timestamp.from(PIDGE_OBSERVED_AT.plusSeconds(5))),
            eq(continuation.eventId()), eq(chefSubOrderId));
    }

    @Test
    void rejectsMarkedContinuationWithDifferentOriginalBorzoOrder() throws Exception {
        project("borzo", "borzo-order-1", "SEARCHING", BORZO_OBSERVED_AT);
        EventEnvelope<DeliveryStatusChangedData> wrong = envelope(
            new DeliveryStatusChangedData(deliveryJobId, checkoutId, chefSubOrderId,
                "pidge", "pidge-order-2", "COURIER_ASSIGNED", null,
                PIDGE_OBSERVED_AT.plusSeconds(5), "borzo", "other-borzo-order", true));

        assertThatThrownBy(() -> service.accept(wrong, "{}"))
            .isInstanceOf(DeliveryStatusNonRetryableException.class)
            .hasMessageContaining("unassigned Borzo");
        verify(jdbc, never()).update(contains("SET delivery_job_id = ?"),
            any(Object[].class));
    }

    @Test
    void rejectsBufferedPidgeStatusForAnotherProviderDeliveryId() throws Exception {
        ResultSet borzo = row("borzo", "borzo-order-1", "SEARCHING", BORZO_OBSERVED_AT);
        ResultSet pidge = row("pidge", "pidge-order-2", "SEARCHING", PIDGE_OBSERVED_AT);
        AtomicInteger locks = new AtomicInteger();
        when(jdbc.query(contains("FROM order_schema.customer_order"),
            any(RowMapper.class), eq(chefSubOrderId)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                return List.of(mapper.mapRow(locks.incrementAndGet() <= 2 ? borzo : pidge, 0));
            });
        when(jdbc.update(any(String.class), any(Object[].class))).thenReturn(1);
        EventEnvelope<DeliveryStatusChangedData> wrong = envelope(
            new DeliveryStatusChangedData(deliveryJobId, checkoutId, chefSubOrderId,
                "pidge", "unrelated-pidge-order", "COURIER_ASSIGNED", null,
                PIDGE_OBSERVED_AT.plusSeconds(5)));
        String payload = new ObjectMapper().findAndRegisterModules().writeValueAsString(wrong);
        ResultSet waiting = mock(ResultSet.class);
        when(waiting.getObject("event_id", UUID.class)).thenReturn(wrong.eventId());
        when(waiting.getString("raw_payload")).thenReturn(payload);
        when(jdbc.query(contains("WAITING_FOR_HANDOFF"), any(RowMapper.class),
            eq(chefSubOrderId), eq(deliveryJobId)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                return List.of(mapper.mapRow(waiting, 0));
            });

        assertThat(service.accept(wrong, payload).result()).isEqualTo("WAITING_FOR_HANDOFF");
        assertThat(service.accept(handoff("borzo-order-1", PIDGE_OBSERVED_AT), "{}")
            .applied()).isTrue();

        verify(jdbc).update(contains("SET processing_status = ?"),
            eq("REJECTED"), eq(wrong.eventId()));
        verify(jdbc, times(1)).update(contains("SET delivery_job_id = ?"),
            any(Object[].class));
    }

    @Test
    void appliesContinuationOnlyWhenOriginalHandoffWasAccepted() throws Exception {
        project("pidge", "pidge-order-2", "SEARCHING", PIDGE_OBSERVED_AT);
        EventEnvelope<DeliveryStatusChangedData> continuation = envelope(
            new DeliveryStatusChangedData(deliveryJobId, checkoutId, chefSubOrderId,
                "pidge", "pidge-order-2", "COURIER_ASSIGNED", null,
                PIDGE_OBSERVED_AT.plusSeconds(5), "borzo", "borzo-order-1", true));
        when(jdbc.queryForObject(contains("coalesce(i.payload"), eq(Boolean.class),
            eq(chefSubOrderId), eq(deliveryJobId), eq("pidge-order-2"),
            eq("pidge-order-2"), eq("borzo-order-1"))).thenReturn(false);

        assertThatThrownBy(() -> service.accept(continuation, "{}"))
            .isInstanceOf(DeliveryStatusNonRetryableException.class)
            .hasMessageContaining("accepted Borzo handoff");
        verify(jdbc, never()).update(contains("SET delivery_job_id = ?"),
            any(Object[].class));

        when(jdbc.queryForObject(contains("coalesce(i.payload"), eq(Boolean.class),
            eq(chefSubOrderId), eq(deliveryJobId), eq("pidge-order-2"),
            eq("pidge-order-2"), eq("borzo-order-1"))).thenReturn(true);
        assertThat(service.accept(continuation, "{}").applied()).isTrue();
    }

    @Test
    void permitsDelayedBorzoHandoffOnlyWithoutEarlierCourierAssignment() throws Exception {
        project("borzo", "borzo-order-1", "DELAYED", BORZO_OBSERVED_AT);
        when(jdbc.queryForObject(contains("order_delivery_status_history"),
            eq(Boolean.class), eq(chefSubOrderId), eq(deliveryJobId), eq("borzo-order-1")))
            .thenReturn(false);

        assertThat(service.accept(handoff("borzo-order-1", PIDGE_OBSERVED_AT), "{}")
            .applied()).isTrue();

        project("borzo", "borzo-order-1", "DELAYED", BORZO_OBSERVED_AT);
        when(jdbc.queryForObject(contains("order_delivery_status_history"),
            eq(Boolean.class), eq(chefSubOrderId), eq(deliveryJobId), eq("borzo-order-1")))
            .thenReturn(true);
        assertThatThrownBy(() -> service.accept(handoff("borzo-order-1", PIDGE_OBSERVED_AT), "{}"))
            .isInstanceOf(DeliveryStatusNonRetryableException.class)
            .hasMessageContaining("assigned courier");
    }

    @Test
    void rejectsBufferedHandoffIfArrivingBorzoProjectionHasAnotherOrderId() throws Exception {
        ResultSet missing = row(null, null, null, null);
        ResultSet borzoProjected = row("borzo", "borzo-order-1", "SEARCHING",
            BORZO_OBSERVED_AT);
        AtomicInteger locks = new AtomicInteger();
        when(jdbc.query(contains("FROM order_schema.customer_order"),
            any(RowMapper.class), eq(chefSubOrderId)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                return List.of(mapper.mapRow(locks.incrementAndGet() <= 2 ? missing : borzoProjected, 0));
            });
        when(jdbc.update(any(String.class), any(Object[].class))).thenReturn(1);
        EventEnvelope<DeliveryStatusChangedData> wrong = handoff(
            "other-borzo-order", PIDGE_OBSERVED_AT);
        String payload = new ObjectMapper().findAndRegisterModules().writeValueAsString(wrong);
        ResultSet waiting = mock(ResultSet.class);
        when(waiting.getObject("event_id", UUID.class)).thenReturn(wrong.eventId());
        when(waiting.getString("raw_payload")).thenReturn(payload);
        when(jdbc.query(contains("WAITING_FOR_PRIOR_PROVIDER"), any(RowMapper.class),
            eq(chefSubOrderId), eq(deliveryJobId)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                return List.of(mapper.mapRow(waiting, 0));
            });

        assertThat(service.accept(wrong, payload).result())
            .isEqualTo("WAITING_FOR_PRIOR_PROVIDER");
        EventEnvelope<DeliveryStatusChangedData> initialBorzo = envelope(
            new DeliveryStatusChangedData(deliveryJobId, checkoutId, chefSubOrderId,
                "borzo", "borzo-order-1", "SEARCHING", null, BORZO_OBSERVED_AT));
        assertThat(service.accept(initialBorzo, "{}").applied()).isTrue();

        verify(jdbc).update(contains("SET processing_status = ?"),
            eq("REJECTED"), eq(wrong.eventId()));
        verify(jdbc, times(1)).update(contains("SET delivery_job_id = ?"),
            any(Object[].class));
    }

    @Test
    void doesNotRetryAVisibleProviderMismatchAsIfProjectionWereMissing() throws Exception {
        project("pidge", null, null, null);

        assertThatThrownBy(() -> service.accept(handoff("borzo-order-1", PIDGE_OBSERVED_AT), "{}"))
            .isInstanceOf(DeliveryStatusNonRetryableException.class)
            .hasMessageContaining("unassigned Borzo");
        verify(jdbc, never()).update(contains("SET delivery_job_id = ?"), any(Object[].class));
    }

    @Test
    void refusesTerminalRegressionAndOldBorzoEventsAfterHandoff() throws Exception {
        project("borzo", "borzo-order-1", "CANCELLED", BORZO_OBSERVED_AT);
        assertThatThrownBy(() -> service.accept(handoff("borzo-order-1", PIDGE_OBSERVED_AT), "{}"))
            .isInstanceOf(DeliveryStatusNonRetryableException.class);

        project("pidge", "pidge-order-2", "SEARCHING", PIDGE_OBSERVED_AT);
        DeliveryStatusChangedData oldBorzo = new DeliveryStatusChangedData(
            deliveryJobId, checkoutId, chefSubOrderId, "borzo", "borzo-order-1",
            "COURIER_ASSIGNED", null, PIDGE_OBSERVED_AT.plusSeconds(5));
        assertThatThrownBy(() -> service.accept(envelope(oldBorzo), "{}"))
            .isInstanceOf(DeliveryStatusNonRetryableException.class)
            .hasMessageContaining("provider changed");
        verify(jdbc, never()).update(contains("SET delivery_job_id = ?"), any(Object[].class));
    }

    @Test
    void ignoresOnlyOlderKnownBorzoEventsAfterAcceptedPidgeHandoff() throws Exception {
        project("pidge", "pidge-order-2", "SEARCHING", PIDGE_OBSERVED_AT);
        Instant older = BORZO_OBSERVED_AT.plusSeconds(30);
        when(jdbc.queryForObject(contains("handoffFromProviderDeliveryId"),
            eq(Boolean.class), eq(chefSubOrderId), eq(deliveryJobId),
            eq("borzo-order-1"), eq(Timestamp.from(older))))
            .thenReturn(true);
        DeliveryStatusChangedData oldBorzo = new DeliveryStatusChangedData(
            deliveryJobId, checkoutId, chefSubOrderId, "borzo", "borzo-order-1",
            "SEARCHING", null, older);
        EventEnvelope<DeliveryStatusChangedData> oldEvent = envelope(oldBorzo);

        var result = service.accept(oldEvent, "{}");

        assertThat(result.applied()).isFalse();
        assertThat(result.result()).isEqualTo("STALE");
        verify(jdbc).update(contains("SET processing_status = ?"),
            eq("STALE"), eq(oldEvent.eventId()));
        verify(jdbc, never()).update(contains("SET delivery_job_id = ?"), any(Object[].class));

        DeliveryStatusChangedData unrelated = new DeliveryStatusChangedData(
            deliveryJobId, checkoutId, chefSubOrderId, "borzo", "unrelated-borzo-order",
            "SEARCHING", null, older);
        assertThatThrownBy(() -> service.accept(envelope(unrelated), "{}"))
            .isInstanceOf(DeliveryStatusNonRetryableException.class)
            .hasMessageContaining("provider changed");
        DeliveryStatusChangedData lateAssignment = new DeliveryStatusChangedData(
            deliveryJobId, checkoutId, chefSubOrderId, "borzo", "borzo-order-1",
            "COURIER_ASSIGNED", null, older);
        assertThatThrownBy(() -> service.accept(envelope(lateAssignment), "{}"))
            .isInstanceOf(DeliveryStatusNonRetryableException.class)
            .hasMessageContaining("provider changed");
    }

    @Test
    void ignoresHandoffOlderThanTheLastBorzoObservation() throws Exception {
        project("borzo", "borzo-order-1", "SEARCHING", BORZO_OBSERVED_AT);

        var result = service.accept(handoff("borzo-order-1", BORZO_OBSERVED_AT), "{}");

        assertThat(result.applied()).isFalse();
        assertThat(result.result()).isEqualTo("STALE");
        verify(jdbc, never()).update(contains("SET delivery_job_id = ?"), any(Object[].class));
    }

    @Test
    void aSilentCravesRiderBeforePickupIsReplacedByBorzoOrPidgeAndTheChefStopsSeeingTheRider() throws Exception {
        String trip = UUID.randomUUID().toString();
        for (String[] at : new String[][] {{"COURIER_ASSIGNED", "borzo"}, {"AT_PICKUP", "pidge"}}) {
            project("craves_fleet", trip, at[0], BORZO_OBSERVED_AT);
            var result = service.accept(riderHandoff(trip, at[1], PIDGE_OBSERVED_AT), "{}");

            assertThat(result.applied()).as(at[0]).isTrue();
            verify(jdbc).update(contains("SET delivery_job_id = ?"),
                eq(deliveryJobId), eq(at[1]), eq(at[1] + "-order-9"), eq("SEARCHING"),
                eq(null), eq(Timestamp.from(PIDGE_OBSERVED_AT)), any(UUID.class), eq(chefSubOrderId));
        }
        // The rider card goes; the customer's delivery code goes with the provider (DeliveryCodeService needs craves_fleet).
        verify(jdbc, times(2)).update(contains("SET delivery_partner_name = NULL"), eq(chefSubOrderId));
        assertThat(new DeliveryCodeService(jdbc).codeForCustomer(chefSubOrderId, "borzo", "PICKED_UP")).isNull();
    }

    @Test
    void aCravesRiderWhoPickedUpOrAnotherTripIsNeverHandedOver() throws Exception {
        String trip = UUID.randomUUID().toString();
        project("craves_fleet", trip, "PICKED_UP", BORZO_OBSERVED_AT);
        assertThatThrownBy(() -> service.accept(riderHandoff(trip, "borzo", PIDGE_OBSERVED_AT), "{}"))
            .isInstanceOf(DeliveryStatusNonRetryableException.class)
            .hasMessageContaining("Craves rider before pickup");

        project("craves_fleet", trip, "COURIER_ASSIGNED", BORZO_OBSERVED_AT);
        assertThatThrownBy(() -> service.accept(riderHandoff(UUID.randomUUID().toString(), "pidge", PIDGE_OBSERVED_AT), "{}"))
            .isInstanceOf(DeliveryStatusNonRetryableException.class)
            .hasMessageContaining("Craves rider before pickup");

        project("borzo", "borzo-order-1", "SEARCHING", BORZO_OBSERVED_AT);
        assertThatThrownBy(() -> service.accept(riderHandoff("borzo-order-1", "pidge", PIDGE_OBSERVED_AT), "{}"))
            .as("a Borzo delivery is not a rider's").isInstanceOf(DeliveryStatusNonRetryableException.class);
        verify(jdbc, never()).update(contains("SET delivery_job_id = ?"), any(Object[].class));
        verify(jdbc, never()).update(contains("SET delivery_partner_name = NULL"), any(Object[].class));
    }

    @Test
    void buffersARiderHandoffUntilTheRidersOwnProjectionArrives() throws Exception {
        String trip = UUID.randomUUID().toString();
        ResultSet missing = row(null, null, null, null);
        ResultSet riderProjected = row("craves_fleet", trip, "COURIER_ASSIGNED", BORZO_OBSERVED_AT);
        AtomicInteger locks = new AtomicInteger();
        when(jdbc.query(contains("FROM order_schema.customer_order"), any(RowMapper.class), eq(chefSubOrderId)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                return List.of(mapper.mapRow(locks.incrementAndGet() <= 2 ? missing : riderProjected, 0));
            });
        when(jdbc.update(any(String.class), any(Object[].class))).thenReturn(1);
        EventEnvelope<DeliveryStatusChangedData> event = riderHandoff(trip, "borzo", PIDGE_OBSERVED_AT);
        String payload = new ObjectMapper().findAndRegisterModules().writeValueAsString(event);
        ResultSet waiting = mock(ResultSet.class);
        when(waiting.getObject("event_id", UUID.class)).thenReturn(event.eventId());
        when(waiting.getString("raw_payload")).thenReturn(payload);
        when(jdbc.query(contains("WAITING_FOR_PRIOR_PROVIDER"), any(RowMapper.class), eq(chefSubOrderId), eq(deliveryJobId)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                return List.of(mapper.mapRow(waiting, 0));
            });

        assertThat(service.accept(event, payload).result()).isEqualTo("WAITING_FOR_PRIOR_PROVIDER");
        assertThat(service.accept(envelope(new DeliveryStatusChangedData(deliveryJobId, checkoutId, chefSubOrderId,
            "craves_fleet", trip, "COURIER_ASSIGNED", null, BORZO_OBSERVED_AT)), "{}").applied()).isTrue();
        verify(jdbc).update(contains("SET delivery_job_id = ?"),
            eq(deliveryJobId), eq("borzo"), eq("borzo-order-9"), eq("SEARCHING"),
            eq(null), eq(Timestamp.from(PIDGE_OBSERVED_AT)), eq(event.eventId()), eq(chefSubOrderId));
    }

    private EventEnvelope<DeliveryStatusChangedData> riderHandoff(String tripId, String courier, Instant observedAt) {
        return envelope(new DeliveryStatusChangedData(deliveryJobId, checkoutId, chefSubOrderId, courier, courier + "-order-9",
            "SEARCHING", null, observedAt, "craves_fleet", tripId));
    }

    private void project(String provider, String providerDeliveryId, String status,
                         Instant observedAt) throws Exception {
        ResultSet row = row(provider, providerDeliveryId, status, observedAt);
        when(jdbc.query(contains("FOR UPDATE"), any(RowMapper.class), eq(chefSubOrderId)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                return List.of(mapper.mapRow(row, 0));
            });
        when(jdbc.update(any(String.class), any(Object[].class))).thenReturn(1);
    }

    private ResultSet row(String provider, String providerDeliveryId, String status,
                          Instant observedAt) throws Exception {
        ResultSet row = mock(ResultSet.class);
        when(row.getObject("id", UUID.class)).thenReturn(chefSubOrderId);
        when(row.getObject("checkout_id", UUID.class)).thenReturn(checkoutId);
        when(row.getObject("customer_identity_id", UUID.class)).thenReturn(UUID.randomUUID());
        when(row.getString("status")).thenReturn("READY_FOR_PICKUP");
        when(row.getTimestamp("accepted_at")).thenReturn(Timestamp.from(BORZO_OBSERVED_AT));
        when(row.getObject("delivery_job_id", UUID.class))
            .thenReturn(provider == null ? null : deliveryJobId);
        when(row.getString("delivery_provider_id")).thenReturn(provider);
        when(row.getString("delivery_provider_delivery_id")).thenReturn(providerDeliveryId);
        when(row.getString("delivery_status")).thenReturn(status);
        when(row.getTimestamp("delivery_status_observed_at"))
            .thenReturn(observedAt == null ? null : Timestamp.from(observedAt));
        return row;
    }

    private EventEnvelope<DeliveryStatusChangedData> handoff(String borzoOrderId,
                                                             Instant observedAt) {
        return envelope(new DeliveryStatusChangedData(deliveryJobId, checkoutId,
            chefSubOrderId, "pidge", "pidge-order-2", "SEARCHING", null, observedAt,
            "borzo", borzoOrderId));
    }

    private EventEnvelope<DeliveryStatusChangedData> envelope(DeliveryStatusChangedData data) {
        return new EventEnvelope<>(UUID.randomUUID(), "DELIVERY_STATUS_CHANGED", "1.0",
            data.observedAt().plusSeconds(1), checkoutId, null, "integration-service",
            "delivery-job/" + data.deliveryJobId(), data);
    }
}
