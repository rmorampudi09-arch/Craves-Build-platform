package in.craves.userchef.web;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.InternalRequestAuthorizer;
import in.craves.userchef.service.BlobDocumentStorageService.StoredDocumentBytes;
import in.craves.userchef.service.RegistrationKitchenPhotoService;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Catalog pulls an approved chef's kitchen photos from here to show them publicly on the kitchen. */
@RestController
@RequestMapping("/internal/v1/chef-kitchen-photos")
public class InternalChefKitchenPhotoController {
    private static final String INTERNAL_HEADER = "X-Craves-Internal-Secret";

    private final RegistrationKitchenPhotoService service;
    private final InternalRequestAuthorizer authorizer;

    public InternalChefKitchenPhotoController(RegistrationKitchenPhotoService service, InternalRequestAuthorizer authorizer) {
        this.service = service;
        this.authorizer = authorizer;
    }

    @GetMapping("/{slot}")
    public ResponseEntity<byte[]> getKitchenPhoto(
        @RequestHeader(name = INTERNAL_HEADER, required = false) String suppliedSecret,
        @RequestParam UUID identityId,
        @PathVariable int slot
    ) {
        authorizer.requireValid(suppliedSecret);
        if (slot != 1 && slot != 2) {
            throw ApiException.badRequest("KITCHEN_PHOTO_SLOT_INVALID", "Kitchen photo slot must be 1 or 2");
        }
        StoredDocumentBytes photo = service.approvedKitchenPhoto(identityId, slot)
            .orElseThrow(() -> ApiException.notFound("KITCHEN_PHOTO_NOT_FOUND", "Kitchen photo was not found"));
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(photo.contentType()))
            .cacheControl(CacheControl.noStore())
            .body(photo.bytes());
    }
}
