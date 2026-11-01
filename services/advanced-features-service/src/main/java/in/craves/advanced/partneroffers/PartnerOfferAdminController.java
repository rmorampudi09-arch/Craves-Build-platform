package in.craves.advanced.partneroffers;

import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferAdminView;
import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferDraft;
import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferTransition;
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
import org.springframework.web.bind.annotation.RestController;

/** Staff enter partner offers as agreed with each partner and see how many were claimed (never by whom). */
@RestController
@RequestMapping("/api/v1/advanced/partner-offers/admin/offers")
public class PartnerOfferAdminController {
    private static final String[] EDITORS = {Roles.PLATFORM_ADMIN, Roles.OPERATIONS_ADMIN};
    private static final String[] READERS = {Roles.PLATFORM_ADMIN, Roles.OPERATIONS_ADMIN, Roles.SUPPORT_ADMIN, Roles.AUDIT_ADMIN};
    private final PartnerOfferService service;

    public PartnerOfferAdminController(PartnerOfferService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<PartnerOfferAdminView>> listPartnerOffers() {
        CurrentUser.requireAnyRole(READERS);
        return ok(service.list());
    }

    @GetMapping("/{id}")
    public ResponseEntity<PartnerOfferAdminView> getPartnerOffer(@PathVariable UUID id) {
        CurrentUser.requireAnyRole(READERS);
        return ok(service.get(id));
    }

    @PostMapping
    public ResponseEntity<PartnerOfferAdminView> createPartnerOffer(@Valid @RequestBody PartnerOfferDraft draft) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(service.create(staff, draft));
    }

    @PutMapping("/{id}")
    public ResponseEntity<PartnerOfferAdminView> changePartnerOfferDraft(@PathVariable UUID id, @Valid @RequestBody PartnerOfferDraft draft) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ok(service.change(staff, id, draft));
    }

    @PostMapping("/{id}/activate")
    public ResponseEntity<PartnerOfferAdminView> activatePartnerOffer(@PathVariable UUID id, @Valid @RequestBody PartnerOfferTransition request) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ok(service.activate(staff, id, request.expectedVersion()));
    }

    @PostMapping("/{id}/pause")
    public ResponseEntity<PartnerOfferAdminView> pausePartnerOffer(@PathVariable UUID id, @Valid @RequestBody PartnerOfferTransition request) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ok(service.pause(staff, id, request.expectedVersion()));
    }

    @PostMapping("/{id}/end")
    public ResponseEntity<PartnerOfferAdminView> endPartnerOffer(@PathVariable UUID id, @Valid @RequestBody PartnerOfferTransition request) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ok(service.end(staff, id, request.expectedVersion()));
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
