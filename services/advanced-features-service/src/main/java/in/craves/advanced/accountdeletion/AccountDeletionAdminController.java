package in.craves.advanced.accountdeletion;

import in.craves.advanced.accountdeletion.AccountDeletionDtos.AccountDeletionCase;
import in.craves.advanced.accountdeletion.AccountDeletionDtos.AccountDeletionCasePage;
import in.craves.advanced.accountdeletion.AccountDeletionDtos.AccountDeletionStaffStep;
import in.craves.advanced.accountdeletion.AccountDeletionDtos.AccountDeletionStatus;
import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Staff queue: platform and compliance admins handle requests; support and audit admins read them. */
@RestController
@RequestMapping("/api/v1/advanced/account-deletion/admin/requests")
public class AccountDeletionAdminController {
    private static final String[] HANDLERS = {Roles.PLATFORM_ADMIN, Roles.COMPLIANCE_ADMIN};
    private static final String[] READERS = {Roles.PLATFORM_ADMIN, Roles.COMPLIANCE_ADMIN, Roles.SUPPORT_ADMIN, Roles.AUDIT_ADMIN};
    private final AccountDeletionService service;

    public AccountDeletionAdminController(AccountDeletionService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<AccountDeletionCasePage> listAccountDeletionCases(@RequestParam(required = false) AccountDeletionStatus status,
                                                                            @RequestParam(required = false) String cursor,
                                                                            @RequestParam(required = false) Integer limit) {
        CurrentUser.requireAnyRole(READERS);
        return ok(service.list(status, cursor, Cursor.limit(limit, 50, 100)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<AccountDeletionCase> getAccountDeletionCase(@PathVariable UUID id) {
        CurrentUser.requireAnyRole(READERS);
        return ok(service.get(id));
    }

    @PostMapping("/{id}/start")
    public ResponseEntity<AccountDeletionCase> startAccountDeletion(@PathVariable UUID id, @Valid @RequestBody AccountDeletionStaffStep step) {
        UUID staff = CurrentUser.requireAnyRole(HANDLERS);
        return ok(service.start(staff, id, step.expectedVersion()));
    }

    /** Erases the person's advanced-feature data; the message tells them what Craves removed. */
    @PostMapping("/{id}/complete")
    public ResponseEntity<AccountDeletionCase> completeAccountDeletion(@PathVariable UUID id, @Valid @RequestBody AccountDeletionStaffStep step) {
        UUID staff = CurrentUser.requireAnyRole(HANDLERS);
        return ok(service.complete(staff, id, step.expectedVersion(), step.messageToPerson()));
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<AccountDeletionCase> rejectAccountDeletion(@PathVariable UUID id, @Valid @RequestBody AccountDeletionStaffStep step) {
        UUID staff = CurrentUser.requireAnyRole(HANDLERS);
        return ok(service.reject(staff, id, step.expectedVersion(), step.messageToPerson()));
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
