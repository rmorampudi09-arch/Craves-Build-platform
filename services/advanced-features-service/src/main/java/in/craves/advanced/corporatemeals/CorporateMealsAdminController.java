package in.craves.advanced.corporatemeals;

import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyChange;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyCharge;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyChargeVoid;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMemberRole;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyMemberView;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyStatement;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyTermsChange;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyView;
import in.craves.advanced.corporatemeals.CorporateMealsDtos.NewCompany;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Staff set up companies, their billing terms and meal share, and their managers; support and audit staff read statements. */
@RestController
@RequestMapping("/api/v1/advanced/corporate-meals/admin")
public class CorporateMealsAdminController {
    private static final String[] EDITORS = {Roles.PLATFORM_ADMIN, Roles.PAYMENTS_ADMIN};
    private static final String[] READERS = {Roles.PLATFORM_ADMIN, Roles.PAYMENTS_ADMIN, Roles.SUPPORT_ADMIN, Roles.AUDIT_ADMIN};
    private final CorporateMealsService service;

    public CorporateMealsAdminController(CorporateMealsService service) {
        this.service = service;
    }

    @GetMapping("/companies")
    public ResponseEntity<List<CompanyView>> listCompanies() {
        CurrentUser.requireAnyRole(READERS);
        return CorporateMealsController.ok(service.companies());
    }

    @PostMapping("/companies")
    public ResponseEntity<CompanyView> createCompany(@Valid @RequestBody NewCompany request) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(service.createCompany(staff, request));
    }

    @PutMapping("/companies/{companyId}")
    public ResponseEntity<CompanyView> updateCompany(@PathVariable UUID companyId, @Valid @RequestBody CompanyChange change) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return CorporateMealsController.ok(service.updateCompany(staff, companyId, change));
    }

    @PutMapping("/companies/{companyId}/terms")
    public ResponseEntity<CompanyView> setCompanyTerms(@PathVariable UUID companyId, @Valid @RequestBody CompanyTermsChange change) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return CorporateMealsController.ok(service.setTerms(staff, companyId, change));
    }

    @PutMapping("/companies/{companyId}/members/{personId}")
    public ResponseEntity<CompanyMemberView> setCompanyMember(@PathVariable UUID companyId, @PathVariable UUID personId,
                                                              @Valid @RequestBody CompanyMemberRole request) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return CorporateMealsController.ok(service.setMember(staff, companyId, personId, request));
    }

    /** month: YYYY-MM, the current India month when omitted. */
    @GetMapping("/companies/{companyId}/statement")
    public ResponseEntity<CompanyStatement> companyStatement(@PathVariable UUID companyId,
                                                             @RequestParam(value = "month", required = false) String month) {
        CurrentUser.requireAnyRole(READERS);
        return CorporateMealsController.ok(service.statement(companyId, month));
    }

    @PostMapping("/charges/{chargeId}/void")
    public ResponseEntity<CompanyCharge> voidCompanyCharge(@PathVariable UUID chargeId, @Valid @RequestBody CompanyChargeVoid request) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return CorporateMealsController.ok(service.voidCharge(staff, chargeId, request.reason()));
    }
}
