package in.craves.integration.fleet.money;

import in.craves.integration.fleet.admin.FleetAdminController;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminModels.FileContent;
import in.craves.integration.fleet.admin.FleetAdminModels.ReasonInput;
import in.craves.integration.fleet.money.FleetMoneyModels.AdjustmentInput;
import in.craves.integration.fleet.money.FleetMoneyModels.BatchInput;
import in.craves.integration.fleet.money.FleetMoneyModels.CancelBatchInput;
import in.craves.integration.fleet.money.FleetMoneyModels.HoldInput;
import in.craves.integration.fleet.money.FleetMoneyModels.UtrInput;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Ops console money (admin-fleet-v1 /payout-batches, /holds and a trip's /pay-adjustments). Each operation checks its own
 * scoped admin roles; mutations are idempotent and audited.
 */
@RestController
@RequestMapping("/api/v1/admin/fleet")
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetMoneyAdminController {
    private static final String[] BATCH_READERS = {"PLATFORM_ADMIN", "PAYMENTS_ADMIN", "AUDIT_ADMIN"};
    private static final String[] HOLD_READERS = {"PLATFORM_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "AUDIT_ADMIN"};
    private static final String[] PAYMENTS = {"PLATFORM_ADMIN", "PAYMENTS_ADMIN"};
    private static final String KEY = "Idempotency-Key";
    private static final String BATCH = "/payout-batches/{batchId}";

    private final FleetEarnings earnings;
    private final FleetPayouts payouts;

    public FleetMoneyAdminController(FleetEarnings earnings, FleetPayouts payouts) {
        this.earnings = earnings;
        this.payouts = payouts;
    }

    @GetMapping("/payout-batches")
    public ResponseEntity<Object> batches(@AuthenticationPrincipal CravesPrincipal principal) {
        return json(200, payouts.batches(FleetAdminController.admin(principal, BATCH_READERS)));
    }

    @PostMapping("/payout-batches")
    public ResponseEntity<Object> createBatch(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                              @RequestBody BatchInput body) {
        return json(201, payouts.createBatch(FleetAdminController.admin(principal, PAYMENTS), key, body));
    }

    @GetMapping(BATCH)
    public ResponseEntity<Object> batch(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID batchId) {
        return json(200, payouts.batch(FleetAdminController.admin(principal, BATCH_READERS), batchId));
    }

    /** The bank file, with full account numbers: an attachment, never cached, every download audited. */
    @GetMapping(BATCH + "/file")
    public ResponseEntity<byte[]> file(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID batchId) {
        FileContent file = payouts.file(FleetAdminController.admin(principal, PAYMENTS), batchId);
        return ResponseEntity.ok().header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff")
            .header("Content-Type", file.contentType())
            .header("Content-Disposition", "attachment; filename=\"rider-payouts-" + batchId + ".csv\"").body(file.bytes());
    }

    @PostMapping(BATCH + "/approve")
    public ResponseEntity<Object> approve(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                          @PathVariable UUID batchId) {
        return json(200, payouts.approve(FleetAdminController.admin(principal, PAYMENTS), key, batchId));
    }

    @PostMapping(BATCH + "/mark-sent")
    public ResponseEntity<Object> markSent(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                           @PathVariable UUID batchId) {
        return json(200, payouts.markSent(FleetAdminController.admin(principal, PAYMENTS), key, batchId));
    }

    /** A file never sent to the bank is withdrawn: weekly pay goes back to the balances, daily withdrawals wait for the next file. */
    @PostMapping(BATCH + "/cancel")
    public ResponseEntity<Object> cancelBatch(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                              @PathVariable UUID batchId, @RequestBody CancelBatchInput body) {
        return json(200, payouts.cancelBatch(FleetAdminController.admin(principal, PAYMENTS), key, batchId, body));
    }

    @PostMapping(BATCH + "/payouts/{payoutId}/utr")
    public ResponseEntity<Object> markPaid(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                           @PathVariable UUID batchId, @PathVariable UUID payoutId, @RequestBody UtrInput body) {
        Admin admin = FleetAdminController.admin(principal, PAYMENTS);
        return json(200, payouts.markPaid(admin, key, batchId, payoutId, body.utr()));
    }

    @PostMapping(BATCH + "/payouts/{payoutId}/fail")
    public ResponseEntity<Object> markFailed(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                             @PathVariable UUID batchId, @PathVariable UUID payoutId, @RequestBody ReasonInput body) {
        Admin admin = FleetAdminController.admin(principal, PAYMENTS);
        return json(200, payouts.markFailed(admin, key, batchId, payoutId, body.reason()));
    }

    /** The bank returned a paid payout: the money is back in the rider's balance and their payouts pause. */
    @PostMapping(BATCH + "/payouts/{payoutId}/reverse")
    public ResponseEntity<Object> reverse(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                          @PathVariable UUID batchId, @PathVariable UUID payoutId, @RequestBody ReasonInput body) {
        Admin admin = FleetAdminController.admin(principal, PAYMENTS);
        return json(200, payouts.reverse(admin, key, batchId, payoutId, body.reason()));
    }

    /** A signed correction to one pay component of a credited trip, with the reason the rider sees. */
    @PostMapping("/trips/{tripId}/pay-adjustments")
    public ResponseEntity<Object> adjustPay(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                            @PathVariable UUID tripId, @RequestBody AdjustmentInput body) {
        return json(201, earnings.adjustTrip(FleetAdminController.admin(principal, PAYMENTS), key, tripId, body));
    }

    @GetMapping("/holds")
    public ResponseEntity<Object> holds(@AuthenticationPrincipal CravesPrincipal principal,
                                        @RequestParam(defaultValue = "ACTIVE") String state) {
        FleetAdminController.admin(principal, HOLD_READERS);
        return json(200, earnings.holds(state));
    }

    @PostMapping("/holds")
    public ResponseEntity<Object> placeHold(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                            @RequestBody HoldInput body) {
        return json(201, earnings.placeHold(FleetAdminController.admin(principal, PAYMENTS), key, body));
    }

    @PostMapping("/holds/{holdId}/release")
    public ResponseEntity<Object> releaseHold(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                              @PathVariable UUID holdId) {
        return json(200, earnings.releaseHold(FleetAdminController.admin(principal, PAYMENTS), key, holdId));
    }

    static ResponseEntity<Object> json(int status, Object body) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(body);
    }
}
