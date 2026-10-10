package in.craves.catalog.banners;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.security.CravesPrincipal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class HomeBannerService {
    private static final Logger log = LoggerFactory.getLogger(HomeBannerService.class);
    private final JdbcTemplate jdbc;
    private volatile CachedFeed feed;
    private final ConcurrentHashMap<UUID, CachedImage> imageCache = new ConcurrentHashMap<>();
    public HomeBannerService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Banner(UUID id, String label, String imagePath, boolean published, int sortOrder, Instant createdAt, Instant updatedAt) {}
    public record Image(byte[] bytes, String contentType) {}
    private record CachedFeed(List<Banner> banners, long expiresAt) {}
    private record CachedImage(Image image, long expiresAt) {}

    private List<Banner> select(String condition, Object... args) {
        return jdbc.query("SELECT id,label,published,sort_order,created_at,updated_at FROM catalog_schema.home_banners " + condition,
            (row, number) -> new Banner(row.getObject("id", UUID.class), row.getString("label"),
                "/api/v1/catalog/banners/" + row.getObject("id", UUID.class) + "/image",
                row.getBoolean("published"), row.getInt("sort_order"), row.getTimestamp("created_at").toInstant(),
                row.getTimestamp("updated_at").toInstant()), args);
    }

    public synchronized List<Banner> published() {
        long now = System.nanoTime();
        if (feed == null || now >= feed.expiresAt()) feed = new CachedFeed(select("WHERE published ORDER BY sort_order, created_at, id LIMIT 20"), now + 5_000_000_000L);
        return feed.banners();
    }
    public List<Banner> adminList(CravesPrincipal principal) { requireAdmin(principal, false); return select("ORDER BY sort_order, created_at, id LIMIT 20"); }

    public Image image(UUID id, CravesPrincipal principal, boolean admin) {
        if (admin) requireAdmin(principal, false);
        if (!admin) {
            var cached = imageCache.get(id);
            if (cached != null && System.nanoTime() < cached.expiresAt()) return cached.image();
        }
        var images = jdbc.query("SELECT image_bytes,content_type FROM catalog_schema.home_banners WHERE id=?" + (admin ? "" : " AND published"),
            (row, number) -> new Image(row.getBytes("image_bytes"), row.getString("content_type")), id);
        if (images.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        var image = images.getFirst();
        if (!admin) {
            // Database inventory is bounded at 20; do not cache missing IDs.
            if (imageCache.size() >= 20) imageCache.clear();
            imageCache.put(id, new CachedImage(image, System.nanoTime() + 30_000_000_000L));
        }
        return image;
    }

    @Transactional
    public Banner create(CravesPrincipal principal, String label, int sortOrder, MultipartFile file) {
        requireAdmin(principal, true);
        validateFields(label, sortOrder);
        byte[] bytes = BannerImageValidator.validate(file);
        // Serialize bounded inventory changes without affecting other catalog operations.
        jdbc.execute("SELECT pg_advisory_xact_lock(812042001)");
        if (jdbc.queryForObject("SELECT count(*) FROM catalog_schema.home_banners", Integer.class) >= 20)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Banner inventory is limited to 20 images.");
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO catalog_schema.home_banners(id,label,image_bytes,content_type,sort_order) VALUES (?,?,?,?,?)",
            id, label.trim(), bytes, file.getContentType(), sortOrder);
        audit(id, principal.identityId(), "UPLOAD_DRAFT");
        feed = null;
        return select("WHERE id=?", id).getFirst();
    }

    @Transactional
    public Banner update(CravesPrincipal principal, UUID id, String label, int sortOrder, boolean published, Instant expectedUpdatedAt) {
        requireAdmin(principal, true);
        validateFields(label, sortOrder);
        if (expectedUpdatedAt == null) throw ApiException.badRequest("BANNER_VERSION_REQUIRED", "Reload the banner before saving.");
        int changed = jdbc.update("UPDATE catalog_schema.home_banners SET label=?,sort_order=?,published=?,updated_at=now() WHERE id=? AND updated_at=?",
            label.trim(), sortOrder, published, id, java.sql.Timestamp.from(expectedUpdatedAt));
        if (changed != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "Banner changed. Reload before saving.");
        audit(id, principal.identityId(), published ? "PUBLISH_UPDATE" : "UNPUBLISH_UPDATE");
        feed = null;
        imageCache.remove(id);
        return select("WHERE id=?", id).getFirst();
    }

    @Transactional
    public void delete(CravesPrincipal principal, UUID id) {
        requireAdmin(principal, true);
        jdbc.execute("SELECT pg_advisory_xact_lock(812042001)");
        // The audit rows reference the banner without a cascade, so they go with it; the log keeps who deleted it.
        jdbc.update("DELETE FROM catalog_schema.home_banner_audit WHERE banner_id=?", id);
        if (jdbc.update("DELETE FROM catalog_schema.home_banners WHERE id=?", id) != 1) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        log.info("Home banner {} deleted by {}", id, principal.identityId());
        feed = null;
        imageCache.remove(id);
    }

    private void audit(UUID id, UUID actor, String action) {
        jdbc.update("INSERT INTO catalog_schema.home_banner_audit(banner_id,actor_id,action) VALUES (?,?,?)", id, actor, action);
    }

    static void validateFields(String label, int sortOrder) {
        if (label == null || label.isBlank() || label.trim().length() > 160 || label.chars().anyMatch(Character::isISOControl) || sortOrder < 0 || sortOrder > 999)
            throw ApiException.badRequest("BANNER_FIELDS_INVALID", "Enter a banner label (up to 160 characters) and a position from 0 to 999.");
    }

    static void requireAdmin(CravesPrincipal principal, boolean write) {
        if (principal == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        if (!principal.hasRole("PLATFORM_ADMIN") && (write || !principal.hasRole("AUDIT_ADMIN")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }
}
