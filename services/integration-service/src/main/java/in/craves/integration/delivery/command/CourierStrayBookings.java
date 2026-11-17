package in.craves.integration.delivery.command;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.command.ProviderCreateAttemptRepository.Attempt;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * With the booking journal on (CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED): a courier booking that is not the order's
 * delivery job. A callback for one waits while its booking is still being recorded (onCallback, for
 * DeliveryWebhookProcessor). A booking the journal gave up and later found (ORPHAN_SUSPECT with the courier's id) is
 * fetched from the courier and then made the order's job or cancelled (resolve, for the reconciliation worker's journal
 * check, which hands each row to one replica). Nothing is decided from a callback's content: a booking is acted on only
 * once the courier's own answer names the reference of a journal row.
 */
@Service
public class CourierStrayBookings {
    public enum Callback {
        /** The booking is being recorded, adopted or cancelled: the callback is tried again without counting the attempt. */
        WAIT,
        /** Craves cancelled this booking: the callback needs nothing. */
        SETTLED,
        /** Not a booking this class knows what to do with: the callback goes the way it did before. */
        NOT_ON_RECORD
    }

    private static final Logger log = LoggerFactory.getLogger(CourierStrayBookings.class);
    /** The couriers whose fetched booking shows the reference it was made under. */
    private static final Set<String> REFERENCE_READABLE = Set.of("borzo", "pidge");
    /** PENDING too: a courier's new booking is a live job elsewhere (the handoff enrols one). Not Pidge's, see resolve. */
    private static final Set<DeliveryStatus> ADOPTABLE = Set.of(DeliveryStatus.PENDING, DeliveryStatus.SEARCHING, DeliveryStatus.COURIER_ASSIGNED,
        DeliveryStatus.COURIER_TO_PICKUP, DeliveryStatus.AT_PICKUP, DeliveryStatus.DELAYED);
    /** The food has left with this courier, or the booking is over: cancelling is no longer the answer. */
    private static final Set<DeliveryStatus> PAST_CANCELLING = Set.of(DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT,
        DeliveryStatus.AT_DROPOFF, DeliveryStatus.DELIVERED, DeliveryStatus.RETURNING, DeliveryStatus.RETURNED, DeliveryStatus.FAILED);

    private final JdbcTemplate jdbc;
    private final ProviderCreateAttemptRepository journal;
    private final DeliveryCommandRepository commands;
    private final DeliveryProviderRouter router;
    private final DeliveryCommandCompletionService completion;
    private final Map<String, DeliveryProviderAdapter> couriers;

    public CourierStrayBookings(JdbcTemplate jdbc, ProviderCreateAttemptRepository journal, DeliveryCommandRepository commands,
                                DeliveryProviderRouter router, DeliveryCommandCompletionService completion,
                                List<DeliveryProviderAdapter> adapters) {
        this.jdbc = jdbc;
        this.journal = journal;
        this.commands = commands;
        this.router = router;
        this.completion = completion;
        // Built at start-up whatever the flag: nothing here may stop the service (the router rejects a duplicate courier id).
        this.couriers = adapters.stream().collect(Collectors.toMap(adapter -> adapter.providerId().toLowerCase(Locale.ROOT),
            Function.identity(), (first, second) -> first));
    }

    public boolean enabled() {
        return journal.enabled();
    }

    /** A callback named a booking that is no delivery job's. May call the courier (one read); a failure is the caller's to handle. */
    public Callback onCallback(String providerId, String bookingId) {
        String provider = providerId.toLowerCase(Locale.ROOT);
        Attempt row = journal.findByProviderRef(provider, bookingId).orElse(null);
        if (row == null) {
            DeliveryProviderAdapter courier = REFERENCE_READABLE.contains(provider) ? couriers.get(provider) : null;
            if (courier == null) {
                return Callback.NOT_ON_RECORD;
            }
            ProviderDelivery booking = courier.track(bookingId).delivery();
            String reference = bookingId.equals(booking.providerDeliveryId()) ? reference(booking) : null;
            row = reference == null ? null : journal.find(provider, reference).orElse(null);
            if (row == null) {
                return Callback.NOT_ON_RECORD;
            }
            if (ProviderCreateAttemptRepository.INTENT.equals(row.state()) || ProviderCreateAttemptRepository.UNKNOWN.equals(row.state())) {
                // The pass, the lookup or the handoff that made the booking has yet to record it.
                return Callback.WAIT;
            }
            boolean orphan = ProviderCreateAttemptRepository.ORPHAN_SUSPECT.equals(row.state());
            if (row.providerRef() != null && !bookingId.equals(row.providerRef())) {
                return Callback.NOT_ON_RECORD;
            }
            if ((orphan || ProviderCreateAttemptRepository.REJECTED.equals(row.state())) && journal.foundAt(row, bookingId)) {
                log.error("CRAVES_ALERT alert={} provider={} chefSubOrderId={} providerRef={} orderHasJob={} commandStatus={}",
                    orphan ? "COURIER_ORPHAN_BOOKING_FOUND" : "COURIER_REJECTED_BOOKING_EXISTS", provider, row.chefSubOrderId(), bookingId,
                    job(row) != null, commands.findByChefSubOrderId(row.chefSubOrderId()).map(CommandRecord::status).orElse("NONE"));
            }
        }
        return switch (row.state()) {
            case ProviderCreateAttemptRepository.ORPHAN_SUSPECT -> Callback.WAIT;
            case "CANCELLED" -> Callback.SETTLED;
            default -> Callback.NOT_ON_RECORD;
        };
    }

    /**
     * One look at an orphan suspect that names a booking. True when this row needs no further look: the booking is the
     * job, was adopted or cancelled, or is now a person's (COURIER_STRAY_BOOKING_UNSETTLED). False: look again at the
     * row's next check.
     */
    public boolean resolve(Attempt row) {
        Job job = job(row);
        if (job != null && row.providerId().equals(job.provider()) && row.providerRef().equals(job.booking())) {
            journal.checkAgain(row, null);
            return true;
        }
        DeliveryProviderAdapter courier = couriers.get(row.providerId());
        ProviderDelivery booking;
        try {
            booking = courier.track(row.providerRef()).delivery();
        } catch (RuntimeException unread) {
            log.warn("Stray courier booking could not be read chefSubOrderId={} provider={} providerRef={}: {}", row.chefSubOrderId(),
                row.providerId(), row.providerRef(), safe(unread));
            return false;
        }
        if (booking.status() == DeliveryStatus.CANCELLED) {
            return cancelled(row, "Already cancelled at the courier");
        }
        boolean orderCancelled = commands.orderCancelled(row.chefSubOrderId());
        // A Pidge order still PENDING was created and never dispatched (PidgeApiClient.create cancels such an order
        // itself): it is no courier for the order, so it is cancelled rather than adopted.
        boolean neverDispatched = "pidge".equals(row.providerId()) && booking.status() == DeliveryStatus.PENDING;
        if (!orderCancelled) {
            if (job == null && !neverDispatched) {
                return adopt(row, booking);
            }
            if (job != null && job.switching()) {
                return false;
            }
            if (job != null && job.courierGone()) {
                return unsettled(row, booking, "the order's own courier is gone, so this may be its only one");
            }
        }
        if (PAST_CANCELLING.contains(booking.status())) {
            // Whatever the order's state: a courier with the food is never cancelled from here.
            return unsettled(row, booking, orderCancelled ? "the order was cancelled and this courier is this far along"
                : "a second courier is this far along");
        }
        String refusal = null;
        try {
            courier.cancel(row.providerRef());
        } catch (RuntimeException refused) {
            refusal = safe(refused);
        }
        try {
            // The courier's own record decides, whatever the cancel call said.
            booking = courier.track(row.providerRef()).delivery();
        } catch (RuntimeException unread) {
            log.warn("Stray courier booking's cancel could not be confirmed chefSubOrderId={} provider={} providerRef={}: {}",
                row.chefSubOrderId(), row.providerId(), row.providerRef(), safe(unread));
            return false;
        }
        if (booking.status() == DeliveryStatus.CANCELLED) {
            return cancelled(row, orderCancelled ? "Cancelled: the order was cancelled"
                : job == null ? "Cancelled: Pidge never dispatched it" : "Cancelled: the order has another delivery job");
        }
        return unsettled(row, booking, refusal == null ? "the courier did not cancel it" : "the courier refused the cancel: " + refusal);
    }

    private boolean adopt(Attempt row, ProviderDelivery booking) {
        CommandRecord command = commands.findByChefSubOrderId(row.chefSubOrderId()).orElse(null);
        String status = command == null ? "NONE" : command.status();
        if ("PROCESSING".equals(status) || "RECONCILIATION_PENDING".equals(status) || "COMPLETED".equals(status)) {
            // A pass or a lookup is at work on the order: once it has a job this booking is cancelled.
            return false;
        }
        if (command == null || "DEAD_LETTER".equals(status)) {
            // Nothing would book this order by itself any more: a person decides, as COURIER_ORPHAN_BOOKING_FOUND told them.
            journal.checkAgain(row, null);
            return true;
        }
        if (!ADOPTABLE.contains(booking.status())) {
            return PAST_CANCELLING.contains(booking.status()) && unsettled(row, booking, "the order has no delivery job and this "
                + "booking is this far along");
        }
        try {
            boolean adopted = completion.adoptStray(command.message(), router.recovered(row, booking)).isPresent();
            log.info("Stray courier booking chefSubOrderId={} provider={} providerRef={} adopted={}", row.chefSubOrderId(), row.providerId(),
                row.providerRef(), adopted);
            return adopted;
        } catch (RuntimeException failed) {
            return unsettled(row, booking, "it is the order's only courier and could not be made its delivery job: " + safe(failed));
        }
    }

    private boolean cancelled(Attempt row, String why) {
        boolean moved = journal.move(row, Set.of(ProviderCreateAttemptRepository.ORPHAN_SUSPECT), "CANCELLED", why, null);
        log.info("Stray courier booking cancelled chefSubOrderId={} provider={} providerRef={} recorded={} reason={}", row.chefSubOrderId(),
            row.providerId(), row.providerRef(), moved, why);
        return true;
    }

    /** Told once: no further look is scheduled, and the row stays ORPHAN_SUSPECT for COURIER_UNRESOLVED_BOOKING's count. */
    private boolean unsettled(Attempt row, ProviderDelivery booking, String why) {
        journal.checkAgain(row, null);
        log.error("CRAVES_ALERT alert=COURIER_STRAY_BOOKING_UNSETTLED provider={} chefSubOrderId={} providerRef={} status={} reason={}",
            row.providerId(), row.chefSubOrderId(), row.providerRef(), booking.status(), why);
        return true;
    }

    /** The order's delivery job: whose it is, whether Borzo's switch to Pidge is under way, and whether its own courier is gone. */
    private Job job(Attempt row) {
        return jdbc.query("""
            SELECT j.provider_id, j.provider_delivery_id,
                   EXISTS (SELECT 1 FROM delivery_schema.delivery_borzo_pidge_handoff h WHERE h.delivery_job_id = j.id
                           AND h.state IN ('PROCESSING_BORZO', 'BORZO_CANCELLED', 'PROCESSING_PIDGE', 'PIDGE_RECONCILIATION_PENDING')) AS switching,
                   j.status IN ('CANCELLED', 'FAILED', 'RETURNED')
                       OR EXISTS (SELECT 1 FROM delivery_schema.delivery_borzo_pidge_handoff h WHERE h.delivery_job_id = j.id
                                  AND h.borzo_cancelled_at IS NOT NULL AND h.state <> 'COMPLETED') AS courier_gone
            FROM delivery_schema.delivery_job j WHERE j.chef_sub_order_id = ?
            """, (rs, n) -> new Job(rs.getString("provider_id"), rs.getString("provider_delivery_id"), rs.getBoolean("switching"),
                rs.getBoolean("courier_gone")), row.chefSubOrderId()).stream().findFirst().orElse(null);
    }

    /** The reference a fetched booking was made under: Borzo keeps it on a point, Pidge as the order's reference. */
    static String reference(ProviderDelivery booking) {
        if (!"borzo".equals(booking.providerId())) {
            return booking.providerOrderName();
        }
        JsonNode points = booking.providerMetadata() == null ? null : booking.providerMetadata().path("points");
        if (points != null && points.isArray()) {
            for (JsonNode point : points) {
                String reference = point.path("client_order_id").asText("");
                if (!reference.isBlank()) {
                    return reference;
                }
            }
        }
        return null;
    }

    private static String safe(RuntimeException error) {
        String message = error.getMessage() == null || error.getMessage().isBlank() ? error.getClass().getSimpleName()
            : error.getMessage().replace('\n', ' ').replace('\r', ' ');
        return message.length() <= 300 ? message : message.substring(0, 300);
    }

    private record Job(String provider, String booking, boolean switching, boolean courierGone) {
    }
}
