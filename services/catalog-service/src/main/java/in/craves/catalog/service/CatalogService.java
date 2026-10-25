package in.craves.catalog.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.catalog.finance.CatalogFinanceEligibility;

import in.craves.catalog.config.CatalogDiscoveryProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.security.CravesPrincipal;
import in.craves.catalog.service.MediaStorageService.StoredMedia;
import in.craves.catalog.web.ApiDtos.AvailabilityRequest;
import in.craves.catalog.web.ApiDtos.DiscoveryRadiusResponse;
import in.craves.catalog.web.ApiDtos.FoodType;
import in.craves.catalog.web.ApiDtos.KitchenPhotoKind;
import in.craves.catalog.web.ApiDtos.KitchenProfileRequest;
import in.craves.catalog.web.ApiDtos.KitchenProfileResponse;
import in.craves.catalog.web.ApiDtos.KitchenSettings;
import in.craves.catalog.web.ApiDtos.KitchenStatus;
import in.craves.catalog.web.ApiDtos.MenuItemImageResponse;
import in.craves.catalog.web.ApiDtos.MenuItemRequest;
import in.craves.catalog.web.ApiDtos.MenuItemResponse;
import in.craves.catalog.web.ApiDtos.MenuItemStatus;
import in.craves.catalog.web.ApiDtos.PublicKitchenDiscoveryResponse;
import in.craves.catalog.web.ApiDtos.PublicKitchenSummaryResponse;
import in.craves.catalog.web.ApiDtos.SocialLinks;
import in.craves.catalog.web.ApiDtos.SpiceLevel;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URISyntaxException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
public class CatalogService {
    static final int MAX_MENU_ITEM_IMAGES = 5;
    /** The 18 drawn faces a chef can pick as the profile picture, hosted by {@link MediaStorageService#chefAvatarUrl}. */
    public static final List<String> CHEF_AVATAR_IDS = IntStream.rangeClosed(1, 18).mapToObj(n -> String.format("chef-avatar-%02d", n)).toList();
    private static final int MAX_TAGS = 10;
    private static final int MAX_TAG_LENGTH = 40;
    private static final int MAX_LINK_LENGTH = 200;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };
    private static final TypeReference<SocialLinks> SOCIAL_LINKS = new TypeReference<>() { };
    private final CatalogFinanceEligibility financeEligibility;
    private final JdbcTemplate jdbcTemplate;
    private final MediaStorageService mediaStorageService;
    private final CatalogDiscoveryProperties discoveryProperties;

    public CatalogService(
        JdbcTemplate jdbcTemplate,
        MediaStorageService mediaStorageService,
        CatalogDiscoveryProperties discoveryProperties,
        CatalogFinanceEligibility financeEligibility
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.mediaStorageService = mediaStorageService;
        this.discoveryProperties = discoveryProperties;
        this.financeEligibility = financeEligibility;
    }

    public KitchenProfileResponse getMyKitchen(CravesPrincipal principal) {
        requireChef(principal);
        return findKitchenByIdentity(principal.identityId())
            .orElseThrow(() -> ApiException.notFound("KITCHEN_PROFILE_NOT_FOUND", "Kitchen profile was not found"));
    }

    @Transactional
    public KitchenProfileResponse upsertMyKitchen(CravesPrincipal principal, KitchenProfileRequest request) {
        requireChef(principal);
        // Null means "keep what is stored" (craves.in and app 1.30.0 do not send these); an empty list or object clears.
        String cuisines = toJson(cleanTags("cuisines", request.cuisines()));
        String serviceAreas = toJson(cleanTags("serviceAreas", request.serviceAreas()));
        String socialLinks = toJson(cleanLinks(request.socialLinks()));
        KitchenStatus status = request.status() == null ? KitchenStatus.DRAFT : request.status();
        if (status == KitchenStatus.ACTIVE) financeEligibility.requireChef(principal.identityId());
        Optional<UUID> existingId = findKitchenIdByIdentity(principal.identityId());
        if (existingId.isEmpty()) {
            UUID id = UUID.randomUUID();
            jdbcTemplate.update(
                "INSERT INTO catalog_schema.kitchen_profile (id, identity_id, kitchen_name, display_name, description, phone_number, email, address_line1, address_line2, landmark, area_name, city, state, postal_code, latitude, longitude, status, cuisines, service_areas, social_links, created_at, updated_at) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(CAST(? AS jsonb), '[]'::jsonb), COALESCE(CAST(? AS jsonb), '[]'::jsonb), COALESCE(CAST(? AS jsonb), '{}'::jsonb), now(), now())",
                id,
                principal.identityId(),
                request.kitchenName(),
                blankToNull(request.displayName()),
                blankToNull(request.description()),
                blankToNull(request.phoneNumber()),
                blankToNull(request.email()),
                request.addressLine1(),
                blankToNull(request.addressLine2()),
                blankToNull(request.landmark()),
                blankToNull(request.areaName()),
                request.city(),
                request.state(),
                blankToNull(request.postalCode()),
                request.latitude(),
                request.longitude(),
                status.name(),
                cuisines,
                serviceAreas,
                socialLinks
            );
        } else {
            jdbcTemplate.update(
                "UPDATE catalog_schema.kitchen_profile SET kitchen_name = ?, display_name = ?, description = ?, phone_number = ?, email = ?, address_line1 = ?, address_line2 = ?, landmark = ?, area_name = ?, city = ?, state = ?, postal_code = ?, latitude = ?, longitude = ?, status = ?, cuisines = COALESCE(CAST(? AS jsonb), cuisines), service_areas = COALESCE(CAST(? AS jsonb), service_areas), social_links = COALESCE(CAST(? AS jsonb), social_links), updated_at = now() WHERE identity_id = ?",
                request.kitchenName(),
                blankToNull(request.displayName()),
                blankToNull(request.description()),
                blankToNull(request.phoneNumber()),
                blankToNull(request.email()),
                request.addressLine1(),
                blankToNull(request.addressLine2()),
                blankToNull(request.landmark()),
                blankToNull(request.areaName()),
                request.city(),
                request.state(),
                blankToNull(request.postalCode()),
                request.latitude(),
                request.longitude(),
                status.name(),
                cuisines,
                serviceAreas,
                socialLinks,
                principal.identityId()
            );
        }
        return getMyKitchen(principal);
    }

    /**
     * Fills the first empty kitchen photo slot. Chefs never replace or remove a kitchen photo; support clears a slot
     * ({@link #clearKitchenPhotoSlot}) and the chef then adds a new one.
     */
    @Transactional
    public KitchenProfileResponse uploadKitchenPhoto(CravesPrincipal principal, KitchenPhotoKind kind, MultipartFile file) {
        requireChef(principal);
        if (kind == KitchenPhotoKind.CHEF) {
            throw ApiException.badRequest("CHEF_PHOTO_UPLOAD_DISABLED", "Chefs choose a Craves picture instead of uploading a photo");
        }
        UUID kitchenId = requireMyKitchenId(principal.identityId());
        // Row lock: two uploads at once fill slot 1 then slot 2, never the same slot.
        Map<String, Object> slots = jdbcTemplate.queryForMap(
            "SELECT kitchen_photo_url, kitchen_photo_2_url FROM catalog_schema.kitchen_profile WHERE id = ? FOR UPDATE", kitchenId
        );
        String column = slots.get("kitchen_photo_url") == null ? "kitchen_photo_url"
            : slots.get("kitchen_photo_2_url") == null ? "kitchen_photo_2_url" : null;
        if (column == null) throw kitchenPhotosLocked();
        StoredMedia stored = mediaStorageService.uploadKitchenImage(kitchenId, kind, file);
        jdbcTemplate.update("UPDATE catalog_schema.kitchen_profile SET " + column + " = ?, updated_at = now() WHERE id = ?", stored.publicUrl(), kitchenId);
        return getMyKitchen(principal);
    }

    /** Support only: empties one kitchen photo slot so the chef can add a new photo; the blob is removed after commit. */
    @Transactional
    public void clearKitchenPhotoSlot(UUID kitchenId, int slot) {
        String column = slot == 1 ? "kitchen_photo_url" : slot == 2 ? "kitchen_photo_2_url" : null;
        if (column == null) throw ApiException.badRequest("KITCHEN_PHOTO_SLOT_INVALID", "Kitchen photo slot must be 1 or 2");
        List<String> previous = jdbcTemplate.query(
            "SELECT " + column + " FROM catalog_schema.kitchen_profile WHERE id = ? FOR UPDATE", (rs, row) -> rs.getString(1), kitchenId
        );
        if (previous.isEmpty()) throw ApiException.notFound("KITCHEN_NOT_FOUND", "Kitchen was not found");
        jdbcTemplate.update("UPDATE catalog_schema.kitchen_profile SET " + column + " = NULL, updated_at = now() WHERE id = ?", kitchenId);
        String url = previous.getFirst();
        if (url != null) afterCommit(() -> mediaStorageService.deleteByPublicUrl(url));
    }

    private static ApiException kitchenPhotosLocked() {
        return ApiException.conflict("KITCHEN_PHOTOS_LOCKED", "Kitchen photos can't be changed. To change one, contact Craves support.");
    }

    /** Stores the shared hosted URL of one of the Craves faces as the chef photo. */
    @Transactional
    public KitchenProfileResponse setChefAvatar(CravesPrincipal principal, String avatarId) {
        requireChef(principal);
        if (!CHEF_AVATAR_IDS.contains(avatarId)) throw ApiException.badRequest("CHEF_AVATAR_UNKNOWN", "Pick one of the Craves pictures");
        return setKitchenPhoto(principal, requireMyKitchenId(principal.identityId()), KitchenPhotoKind.CHEF, mediaStorageService.chefAvatarUrl(avatarId));
    }

    @Transactional
    public KitchenProfileResponse deleteKitchenPhoto(CravesPrincipal principal, KitchenPhotoKind kind) {
        requireChef(principal);
        if (kind == KitchenPhotoKind.KITCHEN) throw kitchenPhotosLocked();
        return setKitchenPhoto(principal, requireMyKitchenId(principal.identityId()), kind, null);
    }

    /** Chef picture only; kitchen photos go through the slot rules above. */
    private KitchenProfileResponse setKitchenPhoto(CravesPrincipal principal, UUID kitchenId, KitchenPhotoKind kind, String url) {
        String column = "chef_photo_url";
        String previous = jdbcTemplate.queryForObject(
            "SELECT " + column + " FROM catalog_schema.kitchen_profile WHERE id = ? FOR UPDATE", String.class, kitchenId
        );
        jdbcTemplate.update("UPDATE catalog_schema.kitchen_profile SET " + column + " = ?, updated_at = now() WHERE id = ?", url, kitchenId);
        if (previous != null) {
            afterCommit(() -> mediaStorageService.deleteByPublicUrl(previous));
        }
        return getMyKitchen(principal);
    }

    public KitchenSettings getKitchenSettings(CravesPrincipal principal) {
        KitchenProfileResponse kitchen = getMyKitchen(principal);
        return new KitchenSettings(kitchen.autoAcceptOrders(), kitchen.defaultPrepMinutes());
    }

    @Transactional
    public KitchenSettings updateKitchenSettings(CravesPrincipal principal, KitchenSettings request) {
        requireChef(principal);
        if (request == null || request.autoAcceptOrders() == null) {
            throw ApiException.badRequest("AUTO_ACCEPT_REQUIRED", "autoAcceptOrders must be true or false");
        }
        Integer prepMinutes = request.defaultPrepMinutes();
        if (prepMinutes != null && (prepMinutes < 5 || prepMinutes > 120)) {
            throw ApiException.badRequest("DEFAULT_PREP_MINUTES_INVALID", "Default preparation time must be between 5 and 120 minutes");
        }
        UUID kitchenId = requireMyKitchenId(principal.identityId());
        jdbcTemplate.update(
            "UPDATE catalog_schema.kitchen_profile SET auto_accept_orders = ?, default_prep_minutes = ?, updated_at = now() WHERE id = ?",
            request.autoAcceptOrders(),
            prepMinutes,
            kitchenId
        );
        return getKitchenSettings(principal);
    }

    public List<MenuItemResponse> listMyMenuItems(CravesPrincipal principal) {
        requireChef(principal);
        UUID kitchenId = requireMyKitchenId(principal.identityId());
        return findMenuItems("WHERE kitchen_id = ? AND status <> 'ARCHIVED' ORDER BY created_at DESC", kitchenId);
    }

    /** Hides a dish from every customer and chef list. Its photos stay in storage and an archived dish cannot come back. */
    @Transactional
    public void archiveMenuItem(CravesPrincipal principal, UUID menuItemId) {
        requireChef(principal);
        UUID kitchenId = requireMyKitchenId(principal.identityId());
        int updated = jdbcTemplate.update(
            "UPDATE catalog_schema.menu_item SET status = 'ARCHIVED', is_available = false, updated_at = now() WHERE id = ? AND kitchen_id = ?",
            menuItemId,
            kitchenId
        );
        if (updated == 0) {
            throw ApiException.notFound("MENU_ITEM_NOT_FOUND", "Menu item was not found");
        }
    }

    @Transactional
    public MenuItemResponse createMenuItem(CravesPrincipal principal, MenuItemRequest request) {
        requireChef(principal);
        validateDeliveryMetadata(request);
        rejectArchivedStatus(request);
        if (statusOrDefault(request.status()) == MenuItemStatus.ACTIVE) financeEligibility.requireChef(principal.identityId());
        UUID kitchenId = requireMyKitchenId(principal.identityId());
        UUID menuItemId = UUID.randomUUID();
        jdbcTemplate.update(
            "INSERT INTO catalog_schema.menu_item (id, kitchen_id, item_name, description, category, food_type, price, currency, serves_count, preparation_time_minutes, spice_level, unit_package_weight_grams, thermobox_required, is_available, status, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())",
            menuItemId,
            kitchenId,
            request.itemName(),
            blankToNull(request.description()),
            request.category(),
            request.foodType().name(),
            request.price(),
            defaultCurrency(request.currency()),
            request.servesCount(),
            request.preparationTimeMinutes(),
            request.spiceLevel() == null ? null : request.spiceLevel().name(),
            request.unitPackageWeightGrams(),
            request.thermoboxRequired(),
            Boolean.TRUE.equals(request.available()),
            statusOrDefault(request.status()).name()
        );
        return getMyMenuItem(principal, menuItemId);
    }

    @Transactional
    public MenuItemResponse updateMenuItem(CravesPrincipal principal, UUID menuItemId, MenuItemRequest request) {
        requireChef(principal);
        validateDeliveryMetadata(request);
        rejectArchivedStatus(request);
        if (statusOrDefault(request.status()) == MenuItemStatus.ACTIVE) financeEligibility.requireChef(principal.identityId());
        UUID kitchenId = requireMyKitchenId(principal.identityId());
        int updated = jdbcTemplate.update(
            "UPDATE catalog_schema.menu_item SET item_name = ?, description = ?, category = ?, food_type = ?, price = ?, currency = ?, serves_count = ?, preparation_time_minutes = ?, spice_level = ?, unit_package_weight_grams = ?, thermobox_required = ?, is_available = ?, status = ?, updated_at = now() WHERE id = ? AND kitchen_id = ? AND status <> 'ARCHIVED'",
            request.itemName(),
            blankToNull(request.description()),
            request.category(),
            request.foodType().name(),
            request.price(),
            defaultCurrency(request.currency()),
            request.servesCount(),
            request.preparationTimeMinutes(),
            request.spiceLevel() == null ? null : request.spiceLevel().name(),
            request.unitPackageWeightGrams(),
            request.thermoboxRequired(),
            Boolean.TRUE.equals(request.available()),
            statusOrDefault(request.status()).name(),
            menuItemId,
            kitchenId
        );
        if (updated == 0) {
            throw ApiException.notFound("MENU_ITEM_NOT_FOUND", "Menu item was not found");
        }
        return getMyMenuItem(principal, menuItemId);
    }

    @Transactional
    public MenuItemResponse updateAvailability(CravesPrincipal principal, UUID menuItemId, AvailabilityRequest request) {
        requireChef(principal);
        UUID kitchenId = requireMyKitchenId(principal.identityId());
        MenuItemResponse existing = getMyMenuItem(principal, menuItemId);
        if (request.available()) financeEligibility.requireChef(principal.identityId());
        if (request.available() && (existing.unitPackageWeightGrams() == null || existing.thermoboxRequired() == null)) {
            throw ApiException.badRequest(
                "DELIVERY_METADATA_REQUIRED",
                "Package weight and thermobox requirement must be set before making a menu item available"
            );
        }
        int updated = jdbcTemplate.update(
            "UPDATE catalog_schema.menu_item SET is_available = ?, updated_at = now() WHERE id = ? AND kitchen_id = ?",
            request.available(),
            menuItemId,
            kitchenId
        );
        if (updated == 0) {
            throw ApiException.notFound("MENU_ITEM_NOT_FOUND", "Menu item was not found");
        }
        jdbcTemplate.update(
            "INSERT INTO catalog_schema.menu_item_availability_audit (id, menu_item_id, chef_identity_id, old_available, new_available, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, now())",
            UUID.randomUUID(),
            menuItemId,
            principal.identityId(),
            existing.available(),
            request.available(),
            blankToNull(request.reason())
        );
        return getMyMenuItem(principal, menuItemId);
    }

    @Transactional
    public MenuItemImageResponse uploadMenuItemImage(CravesPrincipal principal, UUID menuItemId, MultipartFile file, boolean primary) {
        requireChef(principal);
        UUID kitchenId = requireMyKitchenId(principal.identityId());
        getMyMenuItem(principal, menuItemId);
        lockMenuItem(menuItemId);
        if (listImages(menuItemId).size() >= MAX_MENU_ITEM_IMAGES) {
            throw ApiException.conflict("MENU_IMAGE_LIMIT_REACHED", "A dish can have up to " + MAX_MENU_ITEM_IMAGES + " photos");
        }
        StoredMedia stored = mediaStorageService.uploadMenuImage(kitchenId, menuItemId, file);
        boolean shouldBePrimary = primary || listImages(menuItemId).isEmpty();
        if (shouldBePrimary) {
            jdbcTemplate.update("UPDATE catalog_schema.menu_item_image SET is_primary = false WHERE menu_item_id = ?", menuItemId);
        }
        UUID imageId = UUID.randomUUID();
        Integer maxSort = jdbcTemplate.queryForObject(
            "SELECT COALESCE(MAX(sort_order), -1) FROM catalog_schema.menu_item_image WHERE menu_item_id = ?",
            Integer.class,
            menuItemId
        );
        int sortOrder = maxSort == null ? 0 : maxSort + 1;
        jdbcTemplate.update(
            "INSERT INTO catalog_schema.menu_item_image (id, menu_item_id, blob_container, blob_name, content_type, file_size_bytes, public_url, sort_order, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now())",
            imageId,
            menuItemId,
            stored.blobContainer(),
            stored.blobName(),
            stored.contentType(),
            stored.fileSizeBytes(),
            stored.publicUrl(),
            sortOrder,
            shouldBePrimary
        );
        return getImage(imageId);
    }

    /** Removes one saved photo; the next photo becomes the cover. The blob is removed only after commit. */
    @Transactional
    public MenuItemResponse deleteMenuItemImage(CravesPrincipal principal, UUID menuItemId, UUID imageId) {
        requireChef(principal);
        getMyMenuItem(principal, menuItemId);
        lockMenuItem(menuItemId);
        MenuItemImageResponse image = requireImage(menuItemId, imageId);
        jdbcTemplate.update("DELETE FROM catalog_schema.menu_item_image WHERE id = ? AND menu_item_id = ?", imageId, menuItemId);
        if (image.primary()) {
            jdbcTemplate.update(
                "UPDATE catalog_schema.menu_item_image SET is_primary = true WHERE id = (SELECT id FROM catalog_schema.menu_item_image WHERE menu_item_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1)",
                menuItemId
            );
        }
        afterCommit(() -> mediaStorageService.deleteQuietly(image.blobName()));
        return getMyMenuItem(principal, menuItemId);
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { action.run(); }
            });
        } else {
            action.run();
        }
    }

    /** Makes one saved photo the cover customers see first. */
    @Transactional
    public MenuItemResponse setPrimaryMenuItemImage(CravesPrincipal principal, UUID menuItemId, UUID imageId) {
        requireChef(principal);
        getMyMenuItem(principal, menuItemId);
        lockMenuItem(menuItemId);
        requireImage(menuItemId, imageId);
        jdbcTemplate.update("UPDATE catalog_schema.menu_item_image SET is_primary = false WHERE menu_item_id = ?", menuItemId);
        jdbcTemplate.update("UPDATE catalog_schema.menu_item_image SET is_primary = true WHERE id = ? AND menu_item_id = ?", imageId, menuItemId);
        return getMyMenuItem(principal, menuItemId);
    }

    // Serializes photo changes per dish so concurrent uploads cannot pass the photo limit.
    private void lockMenuItem(UUID menuItemId) {
        jdbcTemplate.queryForList("SELECT id FROM catalog_schema.menu_item WHERE id = ? FOR UPDATE", menuItemId);
    }

    private MenuItemImageResponse requireImage(UUID menuItemId, UUID imageId) {
        return jdbcTemplate.query(
            "SELECT * FROM catalog_schema.menu_item_image WHERE id = ? AND menu_item_id = ?", this::mapImage, imageId, menuItemId
        ).stream().findFirst().orElseThrow(() -> ApiException.notFound("MENU_IMAGE_NOT_FOUND", "Menu photo was not found"));
    }

    public PublicKitchenDiscoveryResponse discoverKitchens(BigDecimal latitude, BigDecimal longitude, String city, String areaName, BigDecimal requestedRadiusKm) {
        var eligibility = financeEligibility.current();
        RadiusPolicy policy = resolveRadius(city, areaName, requestedRadiusKm);
        List<PublicKitchenSummaryResponse> kitchens;
        if (latitude != null && longitude != null) {
            kitchens = discoverNearby(latitude, longitude, city, policy.radiusKm(), eligibility);
        } else {
            kitchens = discoverByCity(city, eligibility);
        }
        return new PublicKitchenDiscoveryResponse(
            new DiscoveryRadiusResponse(policy.city(), policy.areaName(), policy.radiusKm(), policy.maxRadiusKm()),
            kitchens
        );
    }

    public KitchenProfileResponse getPublicKitchen(UUID kitchenId) {
        var eligible = financeEligibility.current();
        return readKitchen(kitchenId, eligible.sqlArray()).withoutChefSettings();
    }

    /** Existing authenticated order history/ownership reads never depend on new-selling eligibility. */
    public KitchenProfileResponse getInternalKitchen(UUID kitchenId) { return readKitchen(kitchenId, null); }

    private KitchenProfileResponse readKitchen(UUID kitchenId, String eligibleIds) {
        List<KitchenProfileResponse> rows = jdbcTemplate.query(
            "SELECT * FROM catalog_schema.kitchen_profile WHERE id = ? AND status = 'ACTIVE'" +
                (eligibleIds == null ? "" : " AND identity_id = ANY(CAST(? AS uuid[]))"),
            this::mapKitchen,
            eligibleIds == null ? new Object[]{kitchenId} : new Object[]{kitchenId, eligibleIds}
        );
        if (rows.isEmpty()) {
            throw ApiException.notFound("KITCHEN_NOT_FOUND", "Kitchen was not found");
        }
        return rows.getFirst();
    }

    public List<MenuItemResponse> getPublicMenuItems(UUID kitchenId) {
        getPublicKitchen(kitchenId);
        return findMenuItems("WHERE kitchen_id = ? AND status = 'ACTIVE' AND is_available = true ORDER BY category, item_name", kitchenId);
    }

    public MenuItemResponse getPublicMenuItem(UUID menuItemId) {
        var eligible = financeEligibility.current();
        List<MenuItemResponse> rows = findMenuItems(
            "WHERE id = ? AND status = 'ACTIVE' AND is_available = true AND kitchen_id IN (SELECT id FROM catalog_schema.kitchen_profile WHERE status = 'ACTIVE' AND identity_id = ANY(CAST(? AS uuid[])))",
            menuItemId, eligible.sqlArray()
        );
        if (rows.isEmpty()) {
            throw ApiException.notFound("MENU_ITEM_NOT_FOUND", "Menu item was not found");
        }
        return rows.getFirst();
    }

    private List<PublicKitchenSummaryResponse> discoverNearby(BigDecimal latitude, BigDecimal longitude, String city, BigDecimal radiusKm, CatalogFinanceEligibility.Snapshot eligible) {
        List<Object> args = new ArrayList<>();
        args.add(latitude);
        args.add(longitude);
        args.add(latitude);
        String cityClause = "";
        if (StringUtils.hasText(city)) {
            cityClause = " AND lower(city) = lower(?)";
            args.add(city.trim());
        }
        args.add(eligible.sqlArray());
        args.add(radiusKm);
        String sql = "SELECT k.*, " +
            "(SELECT COUNT(*) FROM catalog_schema.menu_item mi WHERE mi.kitchen_id = k.id AND mi.status = 'ACTIVE' AND mi.is_available = true) AS active_menu_item_count " +
            "FROM (SELECT kp.*, (6371.0 * acos(LEAST(1.0, GREATEST(-1.0, cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) + sin(radians(?)) * sin(radians(latitude)))))) AS distance_km " +
            "FROM catalog_schema.kitchen_profile kp WHERE status = 'ACTIVE' AND latitude IS NOT NULL AND longitude IS NOT NULL" + cityClause + " AND kp.identity_id = ANY(CAST(? AS uuid[]))) k " +
            "WHERE k.distance_km <= ? AND (SELECT COUNT(*) FROM catalog_schema.menu_item mi WHERE mi.kitchen_id = k.id AND mi.status = 'ACTIVE' AND mi.is_available = true) > 0 " +
            "ORDER BY k.distance_km ASC LIMIT 50";
        return jdbcTemplate.query(sql, this::mapPublicKitchen, args.toArray());
    }

    private List<PublicKitchenSummaryResponse> discoverByCity(String city, CatalogFinanceEligibility.Snapshot eligible) {
        List<Object> args = new ArrayList<>();
        String cityClause = "";
        if (StringUtils.hasText(city)) {
            cityClause = " AND lower(k.city) = lower(?)";
            args.add(city.trim());
        }
        args.add(eligible.sqlArray());
        String sql = "SELECT k.*, NULL::numeric AS distance_km, " +
            "(SELECT COUNT(*) FROM catalog_schema.menu_item mi WHERE mi.kitchen_id = k.id AND mi.status = 'ACTIVE' AND mi.is_available = true) AS active_menu_item_count " +
            "FROM catalog_schema.kitchen_profile k WHERE k.status = 'ACTIVE'" + cityClause + " AND k.identity_id = ANY(CAST(? AS uuid[])) " +
            "AND (SELECT COUNT(*) FROM catalog_schema.menu_item mi WHERE mi.kitchen_id = k.id AND mi.status = 'ACTIVE' AND mi.is_available = true) > 0 " +
            "ORDER BY k.updated_at DESC LIMIT 50";
        return jdbcTemplate.query(sql, this::mapPublicKitchen, args.toArray());
    }

    private RadiusPolicy resolveRadius(String city, String areaName, BigDecimal requestedRadiusKm) {
        String effectiveCity = StringUtils.hasText(city) ? city.trim() : "Hyderabad";
        String effectiveArea = StringUtils.hasText(areaName) ? areaName.trim() : "DEFAULT";
        Optional<RadiusPolicy> areaPolicy = findPolicy(effectiveCity, effectiveArea);
        Optional<RadiusPolicy> defaultPolicy = areaPolicy.isPresent() ? areaPolicy : findPolicy(effectiveCity, "DEFAULT");
        RadiusPolicy policy = defaultPolicy.orElse(new RadiusPolicy(effectiveCity, effectiveArea, discoveryProperties.getDefaultRadiusKm(), discoveryProperties.getMaxRadiusKm()));
        BigDecimal radius = requestedRadiusKm == null ? policy.radiusKm() : requestedRadiusKm.min(policy.maxRadiusKm());
        return new RadiusPolicy(policy.city(), policy.areaName(), radius, policy.maxRadiusKm());
    }

    private Optional<RadiusPolicy> findPolicy(String city, String areaName) {
        List<RadiusPolicy> rows = jdbcTemplate.query(
            "SELECT city, area_name, default_radius_km, max_radius_km FROM catalog_schema.service_area_policy WHERE lower(city) = lower(?) AND lower(area_name) = lower(?) AND is_active = true",
            (rs, rowNum) -> new RadiusPolicy(rs.getString("city"), rs.getString("area_name"), rs.getBigDecimal("default_radius_km"), rs.getBigDecimal("max_radius_km")),
            city,
            areaName
        );
        return rows.stream().findFirst();
    }

    private Optional<KitchenProfileResponse> findKitchenByIdentity(UUID identityId) {
        List<KitchenProfileResponse> rows = jdbcTemplate.query(
            "SELECT * FROM catalog_schema.kitchen_profile WHERE identity_id = ?",
            this::mapKitchen,
            identityId
        );
        return rows.stream().findFirst();
    }

    private Optional<UUID> findKitchenIdByIdentity(UUID identityId) {
        List<UUID> rows = jdbcTemplate.query(
            "SELECT id FROM catalog_schema.kitchen_profile WHERE identity_id = ?",
            (rs, rowNum) -> rs.getObject("id", UUID.class),
            identityId
        );
        return rows.stream().findFirst();
    }

    private UUID requireMyKitchenId(UUID identityId) {
        return findKitchenIdByIdentity(identityId)
            .orElseThrow(() -> ApiException.badRequest("KITCHEN_PROFILE_REQUIRED", "Create kitchen profile before managing menu items"));
    }

    private MenuItemResponse getMyMenuItem(CravesPrincipal principal, UUID menuItemId) {
        UUID kitchenId = requireMyKitchenId(principal.identityId());
        List<MenuItemResponse> rows = findMenuItems("WHERE id = ? AND kitchen_id = ? AND status <> 'ARCHIVED'", menuItemId, kitchenId);
        if (rows.isEmpty()) {
            throw ApiException.notFound("MENU_ITEM_NOT_FOUND", "Menu item was not found");
        }
        return rows.getFirst();
    }

    private List<MenuItemResponse> findMenuItems(String whereClause, Object... args) {
        String sql = "SELECT * FROM catalog_schema.menu_item " + whereClause;
        // Images are read after the item rows: a read inside the row mapper needs a second connection from a small pool.
        return jdbcTemplate.query(sql, this::mapMenuItem, args).stream().map(item -> item.withImages(listImages(item.id()))).toList();
    }

    private List<MenuItemImageResponse> listImages(UUID menuItemId) {
        return jdbcTemplate.query(
            "SELECT * FROM catalog_schema.menu_item_image WHERE menu_item_id = ? ORDER BY is_primary DESC, sort_order ASC, created_at ASC",
            this::mapImage,
            menuItemId
        );
    }

    private MenuItemImageResponse getImage(UUID imageId) {
        return jdbcTemplate.query(
            "SELECT * FROM catalog_schema.menu_item_image WHERE id = ?",
            this::mapImage,
            imageId
        ).getFirst();
    }

    private KitchenProfileResponse mapKitchen(ResultSet rs, int rowNum) throws SQLException {
        return new KitchenProfileResponse(
            rs.getObject("id", UUID.class),
            rs.getObject("identity_id", UUID.class),
            rs.getString("kitchen_name"),
            rs.getString("display_name"),
            rs.getString("description"),
            rs.getString("phone_number"),
            rs.getString("email"),
            rs.getString("address_line1"),
            rs.getString("address_line2"),
            rs.getString("landmark"),
            rs.getString("area_name"),
            rs.getString("city"),
            rs.getString("state"),
            rs.getString("postal_code"),
            rs.getBigDecimal("latitude"),
            rs.getBigDecimal("longitude"),
            KitchenStatus.valueOf(rs.getString("status")),
            instant(rs, "created_at"),
            instant(rs, "updated_at"),
            rs.getString("chef_photo_url"),
            rs.getString("kitchen_photo_url"),
            kitchenPhotoUrls(rs),
            fromJson(rs.getString("cuisines"), STRING_LIST),
            fromJson(rs.getString("service_areas"), STRING_LIST),
            fromJson(rs.getString("social_links"), SOCIAL_LINKS),
            rs.getBoolean("auto_accept_orders"),
            integerOrNull(rs, "default_prep_minutes")
        );
    }

    private PublicKitchenSummaryResponse mapPublicKitchen(ResultSet rs, int rowNum) throws SQLException {
        return new PublicKitchenSummaryResponse(
            rs.getObject("id", UUID.class),
            rs.getString("kitchen_name"),
            rs.getString("display_name"),
            rs.getString("description"),
            rs.getString("area_name"),
            rs.getString("city"),
            rs.getBigDecimal("latitude"),
            rs.getBigDecimal("longitude"),
            rs.getBigDecimal("distance_km"),
            rs.getLong("active_menu_item_count"),
            rs.getString("chef_photo_url"),
            kitchenPhotoUrls(rs)
        );
    }

    /** Slot 1 then slot 2, skipping empty slots. */
    public static List<String> kitchenPhotoUrls(ResultSet rs) throws SQLException {
        return java.util.stream.Stream.of(rs.getString("kitchen_photo_url"), rs.getString("kitchen_photo_2_url"))
            .filter(java.util.Objects::nonNull)
            .toList();
    }

    private MenuItemResponse mapMenuItem(ResultSet rs, int rowNum) throws SQLException {
        UUID menuItemId = rs.getObject("id", UUID.class);
        String spiceLevel = rs.getString("spice_level");
        return new MenuItemResponse(
            menuItemId,
            rs.getObject("kitchen_id", UUID.class),
            rs.getString("item_name"),
            rs.getString("description"),
            rs.getString("category"),
            FoodType.valueOf(rs.getString("food_type")),
            rs.getBigDecimal("price"),
            rs.getString("currency"),
            integerOrNull(rs, "serves_count"),
            integerOrNull(rs, "preparation_time_minutes"),
            spiceLevel == null ? null : SpiceLevel.valueOf(spiceLevel),
            integerOrNull(rs, "unit_package_weight_grams"),
            booleanOrNull(rs, "thermobox_required"),
            rs.getBoolean("is_available"),
            MenuItemStatus.valueOf(rs.getString("status")),
            List.of(),
            instant(rs, "created_at"),
            instant(rs, "updated_at")
        );
    }

    private MenuItemImageResponse mapImage(ResultSet rs, int rowNum) throws SQLException {
        return new MenuItemImageResponse(
            rs.getObject("id", UUID.class),
            rs.getObject("menu_item_id", UUID.class),
            rs.getString("blob_container"),
            rs.getString("blob_name"),
            rs.getString("content_type"),
            rs.getLong("file_size_bytes"),
            rs.getString("public_url"),
            rs.getInt("sort_order"),
            rs.getBoolean("is_primary"),
            instant(rs, "created_at")
        );
    }

    private void requireChef(CravesPrincipal principal) {
        if (principal == null || !principal.hasRole("CHEF")) {
            throw ApiException.forbidden("CHEF_ROLE_REQUIRED", "Chef role is required");
        }
    }

    private static void validateDeliveryMetadata(MenuItemRequest request) {
        if (request.unitPackageWeightGrams() == null || request.unitPackageWeightGrams() <= 0) {
            throw ApiException.badRequest(
                "PACKAGE_WEIGHT_REQUIRED",
                "Unit packaged weight must be greater than zero grams"
            );
        }
        if (request.thermoboxRequired() == null) {
            throw ApiException.badRequest(
                "THERMOBOX_REQUIREMENT_REQUIRED",
                "Thermobox requirement must be explicitly supplied"
            );
        }
    }

    private static void rejectArchivedStatus(MenuItemRequest request) {
        if (request.status() == MenuItemStatus.ARCHIVED) {
            throw ApiException.badRequest("MENU_ITEM_STATUS_INVALID", "A dish is archived by deleting it");
        }
    }

    /** Null stays null (keep stored); otherwise at most 10 entries of 1-40 characters after trimming. */
    private static List<String> cleanTags(String field, List<String> values) {
        if (values == null) return null;
        if (values.size() > MAX_TAGS) {
            throw ApiException.badRequest("TOO_MANY_ENTRIES", field + " can have at most " + MAX_TAGS + " entries");
        }
        List<String> cleaned = new ArrayList<>(values.size());
        for (String value : values) {
            String trimmed = value == null ? "" : value.trim();
            if (trimmed.isEmpty() || trimmed.length() > MAX_TAG_LENGTH) {
                throw ApiException.badRequest("INVALID_ENTRY", "Each entry in " + field + " must be 1 to " + MAX_TAG_LENGTH + " characters");
            }
            cleaned.add(trimmed);
        }
        return cleaned;
    }

    /** Null stays null (keep stored); a given object replaces all four links, a blank link clears that one. */
    private static SocialLinks cleanLinks(SocialLinks links) {
        if (links == null) return null;
        return new SocialLinks(
            cleanLink("instagram", links.instagram()),
            cleanLink("facebook", links.facebook()),
            cleanLink("youtube", links.youtube()),
            cleanLink("website", links.website())
        );
    }

    private static String cleanLink(String field, String value) {
        String link = blankToNull(value);
        if (link == null) return null;
        try {
            URI uri = new URI(link);
            if (link.length() <= MAX_LINK_LENGTH && "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null) return link;
        } catch (URISyntaxException ignored) {
            // rejected below, same as any other non-https link
        }
        throw ApiException.badRequest("INVALID_SOCIAL_LINK", field + " must be an https:// link of at most " + MAX_LINK_LENGTH + " characters");
    }

    private static String toJson(Object value) {
        try {
            return value == null ? null : JSON.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Kitchen profile value could not be stored", ex);
        }
    }

    private static <T> T fromJson(String json, TypeReference<T> type) {
        try {
            return JSON.readValue(json, type);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Stored kitchen profile value is not valid JSON", ex);
        }
    }

    private static String defaultCurrency(String currency) {
        return StringUtils.hasText(currency) ? currency.trim().toUpperCase() : "INR";
    }

    private static MenuItemStatus statusOrDefault(MenuItemStatus status) {
        return status == null ? MenuItemStatus.DRAFT : status;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static Integer integerOrNull(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private static Boolean booleanOrNull(ResultSet rs, String column) throws SQLException {
        boolean value = rs.getBoolean(column);
        return rs.wasNull() ? null : value;
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private record RadiusPolicy(String city, String areaName, BigDecimal radiusKm, BigDecimal maxRadiusKm) {
    }
}
