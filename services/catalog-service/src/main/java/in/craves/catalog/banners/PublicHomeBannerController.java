package in.craves.catalog.banners;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog/banners")
public class PublicHomeBannerController {
    private final HomeBannerService service;
    public PublicHomeBannerController(HomeBannerService service) { this.service = service; }
    public record Feed(List<HomeBannerService.Banner> banners) {}

    @GetMapping
    public ResponseEntity<Feed> list() {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(new Feed(service.published()));
    }

    @GetMapping("/{id}/image")
    public ResponseEntity<byte[]> image(@PathVariable UUID id) {
        var image = service.image(id, null, false);
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "public, max-age=300")
            .header("X-Content-Type-Options", "nosniff").contentType(MediaType.parseMediaType(image.contentType())).body(image.bytes());
    }
}
