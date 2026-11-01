package in.craves.advanced.semanticsearch;

import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchConceptDraft;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchConceptView;
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

/** Staff curate the phrases search understands. Concepts are switched off (active=false), never deleted. */
@RestController
@RequestMapping("/api/v1/advanced/semantic-search/admin/concepts")
public class SemanticSearchAdminController {
    private static final String[] EDITORS = {Roles.PLATFORM_ADMIN, Roles.OPERATIONS_ADMIN, Roles.CHEF_ADMIN};
    private static final String[] READERS = {Roles.PLATFORM_ADMIN, Roles.OPERATIONS_ADMIN, Roles.CHEF_ADMIN, Roles.SUPPORT_ADMIN, Roles.AUDIT_ADMIN};
    private final SemanticSearchService service;

    public SemanticSearchAdminController(SemanticSearchService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<SearchConceptView>> listSearchConcepts() {
        CurrentUser.requireAnyRole(READERS);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.concepts());
    }

    @PostMapping
    public ResponseEntity<SearchConceptView> createSearchConcept(@Valid @RequestBody SearchConceptDraft draft) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(service.create(staff, draft));
    }

    @PutMapping("/{id}")
    public ResponseEntity<SearchConceptView> changeSearchConcept(@PathVariable UUID id, @Valid @RequestBody SearchConceptDraft draft) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.change(staff, id, draft));
    }
}
