package in.craves.integration.delivery.billing;

import in.craves.integration.delivery.billing.CourierBilling.Admin;
import in.craves.integration.delivery.billing.CourierBilling.InvoiceInput;
import in.craves.integration.delivery.billing.CourierBilling.SettingInput;
import in.craves.integration.fleet.FleetRules;
import in.craves.integration.security.CravesPrincipal;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

/**
 * admin-fleet-v1 /courier-billing: an admin's billing settings per courier, and courier invoices imported and compared
 * with what Craves recorded. Off unless CRAVES_DELIVERY_COURIER_CHARGE_ENABLED (then this controller does not exist and
 * WebSecurityConfiguration denies the path). Payments and platform admins write; operations and audit read too.
 * Nothing here pays, refunds, charges or changes a booking.
 */
@RestController
@RequestMapping("/api/v1/admin/fleet/courier-billing")
@ConditionalOnProperty(name = "craves.delivery-command.courier-charge-enabled", havingValue = "true")
public class CourierBillingController {
    static final String[] READERS = {"PLATFORM_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "AUDIT_ADMIN"};
    static final String[] WRITERS = {"PLATFORM_ADMIN", "PAYMENTS_ADMIN"};

    private final CourierBilling billing;

    public CourierBillingController(CourierBilling billing) {
        this.billing = billing;
    }

    @GetMapping("/settings")
    public ResponseEntity<Object> settings(@AuthenticationPrincipal CravesPrincipal principal) {
        admin(principal, READERS);
        return json(Map.of("settings", billing.settings()));
    }

    @PutMapping("/settings/{courier}")
    public ResponseEntity<Object> saveSetting(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable String courier,
                                              @RequestBody SettingInput body) {
        return json(billing.save(admin(principal, WRITERS), courier, body));
    }

    @GetMapping("/invoices")
    public ResponseEntity<Object> invoices(@AuthenticationPrincipal CravesPrincipal principal) {
        admin(principal, READERS);
        return json(Map.of("invoices", billing.imports()));
    }

    @PostMapping("/invoices")
    public ResponseEntity<Object> importInvoice(@AuthenticationPrincipal CravesPrincipal principal, @RequestBody InvoiceInput body) {
        return json(billing.importInvoice(admin(principal, WRITERS), body));
    }

    @GetMapping("/invoices/{importId}")
    public ResponseEntity<Object> invoice(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable long importId) {
        admin(principal, READERS);
        return json(billing.check(importId, false));
    }

    /** Errors as the contract's {code, message}; the messages are this package's fixed texts, never request values. */
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Object> refused(ResponseStatusException error) {
        HttpStatus status = HttpStatus.valueOf(error.getStatusCode().value());
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(Map.of(
            "code", status == HttpStatus.BAD_REQUEST ? "VALIDATION_FAILED" : status.name(), "message", String.valueOf(error.getReason())));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<Object> unreadable(Exception error) {
        return refused(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Check the details and try again."));
    }

    private static Admin admin(CravesPrincipal principal, String... roles) {
        if (principal == null || principal.identityId() == null || !principal.hasAnyRole(roles)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "An admin role for courier billing is required");
        }
        return new Admin(principal.identityId(), FleetRules.adminName(principal.phoneNumber(), principal.identityId()));
    }

    private static ResponseEntity<Object> json(Object body) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(body);
    }
}
