package in.craves.catalog.banners;

import in.craves.catalog.security.CravesPrincipal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/catalog/admin/banners")
public class AdminHomeBannerController {
    private final HomeBannerService service;
    public AdminHomeBannerController(HomeBannerService service) { this.service = service; }
    public record Update(String label, int sortOrder, boolean published, Instant expectedUpdatedAt) {}

    @GetMapping
    public ResponseEntity<List<HomeBannerService.Banner>> list(@AuthenticationPrincipal CravesPrincipal principal) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(service.adminList(principal));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public HomeBannerService.Banner create(@AuthenticationPrincipal CravesPrincipal principal, @RequestParam String label,
        @RequestParam(defaultValue = "0") int sortOrder, @RequestParam MultipartFile file) {
        return service.create(principal, label, sortOrder, file);
    }

    @PutMapping("/{id}")
    public HomeBannerService.Banner update(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID id, @RequestBody Update request) {
        return service.update(principal, id, request.label(), request.sortOrder(), request.published(), request.expectedUpdatedAt());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID id) {
        service.delete(principal, id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/image")
    public ResponseEntity<byte[]> image(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID id) {
        var image = service.image(id, principal, true);
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store")
            .header("X-Content-Type-Options", "nosniff").contentType(MediaType.parseMediaType(image.contentType())).body(image.bytes());
    }
}
