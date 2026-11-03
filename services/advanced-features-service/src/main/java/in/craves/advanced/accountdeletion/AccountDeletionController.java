package in.craves.advanced.accountdeletion;

import in.craves.advanced.accountdeletion.AccountDeletionDtos.AccountDeletionAsk;
import in.craves.advanced.accountdeletion.AccountDeletionDtos.AccountDeletionView;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import in.craves.advanced.platform.web.ApiProblem;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A signed-in customer, chef or rider asks Craves to delete their account, sees where it stands, or withdraws it before staff start. */
@RestController
@RequestMapping("/api/v1/advanced/account-deletion")
public class AccountDeletionController {
    private final AccountDeletionService service;

    public AccountDeletionController(AccountDeletionService service) {
        this.service = service;
    }

    /** Requires {@code X-Confirm-Delete: DELETE}. Asking again while a request is open answers 200 with that request. */
    @PostMapping
    public ResponseEntity<AccountDeletionView> requestAccountDeletion(@RequestHeader(value = "X-Confirm-Delete", required = false) String confirm,
                                                                     @Valid @RequestBody(required = false) AccountDeletionAsk ask) {
        if (!"DELETE".equals(confirm)) throw ApiProblem.badRequest("CONFIRMATION_REQUIRED", "Send X-Confirm-Delete: DELETE to ask for deletion");
        UUID person = CurrentUser.id();
        var roles = Roles.KNOWN.stream().filter(CurrentUser::hasRole).sorted().toList();
        AccountDeletionService.Asked asked = service.request(person, roles, ask == null ? null : ask.reason());
        return ResponseEntity.status(asked.created() ? HttpStatus.CREATED : HttpStatus.OK).cacheControl(CacheControl.noStore()).body(asked.request());
    }

    @GetMapping
    public ResponseEntity<AccountDeletionView> myAccountDeletion() {
        return ok(service.mine(CurrentUser.id()));
    }

    @DeleteMapping
    public ResponseEntity<AccountDeletionView> withdrawAccountDeletion() {
        return ok(service.withdraw(CurrentUser.id()));
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
