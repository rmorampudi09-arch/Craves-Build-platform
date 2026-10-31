package in.craves.advanced.taxonomy;

import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import in.craves.advanced.taxonomy.TaxonomyDtos.AdminTerm;
import in.craves.advanced.taxonomy.TaxonomyDtos.ChefTagsView;
import in.craves.advanced.taxonomy.TaxonomyDtos.NewTerm;
import in.craves.advanced.taxonomy.TaxonomyDtos.StaffTagRequest;
import in.craves.advanced.taxonomy.TaxonomyDtos.TermChange;
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
import org.springframework.web.bind.annotation.RestController;

/** Staff upkeep of the vocabulary and corrections of dish labels. Terms are retired, never deleted. */
@RestController
@RequestMapping("/api/v1/advanced/taxonomy/admin")
public class TaxonomyAdminController {
    private static final String[] EDITORS = {Roles.PLATFORM_ADMIN, Roles.CHEF_ADMIN, Roles.COMPLIANCE_ADMIN};
    private final TaxonomyService service;

    public TaxonomyAdminController(TaxonomyService service) {
        this.service = service;
    }

    @GetMapping("/terms")
    public ResponseEntity<List<AdminTerm>> listTerms() {
        CurrentUser.requireAnyRole(EDITORS);
        return TaxonomyController.ok(service.adminTerms());
    }

    @PostMapping("/terms")
    public ResponseEntity<AdminTerm> createTerm(@Valid @RequestBody NewTerm request) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(service.createTerm(staff, request));
    }

    @PutMapping("/terms/{code}")
    public ResponseEntity<AdminTerm> updateTerm(@PathVariable String code, @Valid @RequestBody TermChange change) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return TaxonomyController.ok(service.updateTerm(staff, code, change));
    }

    @PutMapping("/menu-items/{menuItemId}")
    public ResponseEntity<ChefTagsView> correctDishTags(@PathVariable UUID menuItemId, @Valid @RequestBody StaffTagRequest request) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return TaxonomyController.ok(service.correctTags(staff, menuItemId, request));
    }
}
