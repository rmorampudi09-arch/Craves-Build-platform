package in.craves.advanced.corporatemeals;

import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyCharge;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyChargeConfirm;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyInviteView;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMealCart;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMealQuote;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMemberPage;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMembership;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyStatement;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyView;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.JoinCompany;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.NewCompanyInvite;
import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.data.Idempotency;
import in.craves.advanced.platform.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** A member's company, its meal share at checkout (quote, reserve, confirm, release), and the company manager's tools. */
@RestController
@RequestMapping("/api/v1/advanced/corporate-meals")
public class CorporateMealsController {
    private final CorporateMealsService service;
    private final Idempotency idempotency;

    public CorporateMealsController(CorporateMealsService service, Idempotency idempotency) {
        this.service = service;
        this.idempotency = idempotency;
    }

    @PostMapping("/join")
    public ResponseEntity<CompanyMembership> joinCompany(@Valid @RequestBody JoinCompany request) {
        return ok(service.join(CurrentUser.id(), request));
    }

    @GetMapping("/me")
    public ResponseEntity<CompanyMembership> myCompanyMembership() {
        return ok(service.membership(CurrentUser.id()));
    }

    @DeleteMapping("/me")
    public ResponseEntity<Void> leaveCompany() {
        service.leave(CurrentUser.id());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/quote")
    public ResponseEntity<CompanyMealQuote> quoteCompanyMeal(@Valid @RequestBody CompanyMealCart cart) {
        return ok(service.quote(CurrentUser.id(), cart));
    }

    @PostMapping("/charges")
    public ResponseEntity<CompanyCharge> reserveCompanyMeal(@Valid @RequestBody CompanyMealCart cart,
                                                            @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        UUID person = CurrentUser.id();
        var outcome = idempotency.run("corporate-meals.reserve", person, key, cart, CompanyCharge.class, () -> service.reserve(person, cart));
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .header("Idempotent-Replayed", String.valueOf(outcome.replayed())).body(outcome.body());
    }

    @PostMapping("/charges/{chargeId}/confirm")
    public ResponseEntity<CompanyCharge> confirmCompanyMeal(@PathVariable UUID chargeId, @Valid @RequestBody CompanyChargeConfirm request) {
        return ok(service.confirm(CurrentUser.id(), chargeId, request.orderId()));
    }

    @DeleteMapping("/charges/{chargeId}")
    public ResponseEntity<Void> releaseCompanyMeal(@PathVariable UUID chargeId) {
        service.release(CurrentUser.id(), chargeId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/manager/company")
    public ResponseEntity<CompanyView> managedCompany() {
        return ok(service.managedCompany(CurrentUser.id()));
    }

    @GetMapping("/manager/members")
    public ResponseEntity<CompanyMemberPage> companyMembers(@RequestParam(value = "cursor", required = false) String cursor,
                                                            @RequestParam(value = "limit", required = false) Integer limit) {
        return ok(service.members(CurrentUser.id(), cursor, Cursor.limit(limit, 50, 200)));
    }

    @DeleteMapping("/manager/members/{personId}")
    public ResponseEntity<Void> removeCompanyMember(@PathVariable UUID personId) {
        service.removeMember(CurrentUser.id(), personId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/manager/invites")
    public ResponseEntity<CompanyInviteView> createCompanyInvite(@Valid @RequestBody NewCompanyInvite request) {
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(service.createInvite(CurrentUser.id(), request));
    }

    @GetMapping("/manager/invites")
    public ResponseEntity<List<CompanyInviteView>> companyInvites() {
        return ok(service.invites(CurrentUser.id()));
    }

    @DeleteMapping("/manager/invites/{inviteId}")
    public ResponseEntity<Void> revokeCompanyInvite(@PathVariable UUID inviteId) {
        service.revokeInvite(CurrentUser.id(), inviteId);
        return ResponseEntity.noContent().build();
    }

    /** month: YYYY-MM, the current India month when omitted. */
    @GetMapping("/manager/statement")
    public ResponseEntity<CompanyStatement> managedCompanyStatement(@RequestParam(value = "month", required = false) String month) {
        return ok(service.managedStatement(CurrentUser.id(), month));
    }

    static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
