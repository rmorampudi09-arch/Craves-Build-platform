package in.craves.catalog.service;

import in.craves.catalog.config.CatalogDiscoveryProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.service.DiscoveryCriteria.KitchenSort;
import in.craves.catalog.service.DiscoveryCriteria.MenuItemSort;
import in.craves.catalog.web.ApiDtos.FoodType;
import in.craves.catalog.web.ApiDtos.SpiceLevel;
import in.craves.catalog.web.DiscoveryDtos.NearbyKitchenDiscoveryResponse;
import in.craves.catalog.web.DiscoveryDtos.NearbyKitchenSummaryResponse;
import in.craves.catalog.web.DiscoveryDtos.NearbyMenuItemDiscoveryResponse;
import in.craves.catalog.web.DiscoveryDtos.NearbyMenuItemSummaryResponse;
import in.craves.catalog.web.DiscoveryDtos.PageMetadata;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class NearbyDiscoveryService {
    private static final BigDecimal MIN_LATITUDE = new BigDecimal("-90");
    private static final BigDecimal MAX_LATITUDE = new BigDecimal("90");
    private static final BigDecimal MIN_LONGITUDE = new BigDecimal("-180");
    private static final BigDecimal MAX_LONGITUDE = new BigDecimal("180");
    private static final int MAX_SEARCH_QUERY_LENGTH = 120;
    private static final int MAX_CATEGORY_LENGTH = 80;

    private static final String REQUEST_LOCATION_CTE = """
        WITH request_location AS (
            SELECT public.ST_SetSRID(
                public.ST_MakePoint(
                    CAST(:longitude AS double precision),
                    CAST(:latitude AS double precision)
                ),
                4326
            )::public.geography AS location
        )
        """;

    private static final String ELIGIBLE_MENU_ITEM_PREDICATES = """
        %s.status = 'ACTIVE'
        AND %s.is_available = true
        AND %s.unit_package_weight_grams IS NOT NULL
        AND %s.thermobox_required IS NOT NULL
        """;

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final CatalogDiscoveryProperties discoveryProperties;

    public NearbyDiscoveryService(
        JdbcTemplate jdbcTemplate,
        CatalogDiscoveryProperties discoveryProperties
    ) {
        this(new NamedParameterJdbcTemplate(jdbcTemplate), discoveryProperties);
    }

    NearbyDiscoveryService(
        NamedParameterJdbcTemplate jdbcTemplate,
        CatalogDiscoveryProperties discoveryProperties
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.discoveryProperties = discoveryProperties;
    }

    public NearbyKitchenDiscoveryResponse discoverKitchens(
        BigDecimal latitude,
        BigDecimal longitude,
        int radiusMeters,
        int page,
        int size
    ) {
        return discoverKitchens(
            latitude,
            longitude,
            radiusMeters,
            DiscoveryCriteria.empty(),
            KitchenSort.DISTANCE_ASC,
            page,
            size
        );
    }

    public NearbyKitchenDiscoveryResponse discoverKitchens(
        BigDecimal latitude,
        BigDecimal longitude,
        int radiusMeters,
        DiscoveryCriteria criteria,
        KitchenSort sort,
        int page,
        int size
    ) {
        validateQuery(latitude, longitude, radiusMeters, page, size);
        ValidatedCriteria validatedCriteria = validateCriteria(criteria);
        KitchenSort effectiveSort = sort == null ? KitchenSort.DISTANCE_ASC : sort;
        MapSqlParameterSource parameters = parameters(
            latitude,
            longitude,
            radiusMeters,
            validatedCriteria,
            page,
            size
        );
        long totalElements = countNearbyKitchens(validatedCriteria, parameters);
        List<NearbyKitchenSummaryResponse> kitchens = totalElements == 0
            ? List.of()
            : queryNearbyKitchens(validatedCriteria, effectiveSort, parameters);
        return new NearbyKitchenDiscoveryResponse(
            latitude,
            longitude,
            radiusMeters,
            pageMetadata(page, size, totalElements),
            kitchens
        );
    }

    public NearbyMenuItemDiscoveryResponse discoverMenuItems(
        BigDecimal latitude,
        BigDecimal longitude,
        int radiusMeters,
        int page,
        int size
    ) {
        return discoverMenuItems(
            latitude,
            longitude,
            radiusMeters,
            DiscoveryCriteria.empty(),
            MenuItemSort.DISTANCE_ASC,
            page,
            size
        );
    }

    public NearbyMenuItemDiscoveryResponse discoverMenuItems(
        BigDecimal latitude,
        BigDecimal longitude,
        int radiusMeters,
        DiscoveryCriteria criteria,
        MenuItemSort sort,
        int page,
        int size
    ) {
        validateQuery(latitude, longitude, radiusMeters, page, size);
        ValidatedCriteria validatedCriteria = validateCriteria(criteria);
        MenuItemSort effectiveSort = sort == null ? MenuItemSort.DISTANCE_ASC : sort;
        MapSqlParameterSource parameters = parameters(
            latitude,
            longitude,
            radiusMeters,
            validatedCriteria,
            page,
            size
        );
        long totalElements = countNearbyMenuItems(validatedCriteria, parameters);
        List<NearbyMenuItemSummaryResponse> menuItems = totalElements == 0
            ? List.of()
            : queryNearbyMenuItems(validatedCriteria, effectiveSort, parameters);
        return new NearbyMenuItemDiscoveryResponse(
            latitude,
            longitude,
            radiusMeters,
            pageMetadata(page, size, totalElements),
            menuItems
        );
    }

    private long countNearbyKitchens(
        ValidatedCriteria criteria,
        MapSqlParameterSource parameters
    ) {
        String sql = REQUEST_LOCATION_CTE + "SELECT COUNT(*) " + kitchenFilter(criteria);
        Long count = jdbcTemplate.queryForObject(sql, parameters, Long.class);
        return count == null ? 0 : count;
    }

    private List<NearbyKitchenSummaryResponse> queryNearbyKitchens(
        ValidatedCriteria criteria,
        KitchenSort sort,
        MapSqlParameterSource parameters
    ) {
        StringBuilder sql = new StringBuilder(REQUEST_LOCATION_CTE).append("""
            SELECT
                kp.id,
                kp.kitchen_name,
                kp.display_name,
                kp.description,
                kp.area_name,
                kp.city,
                kp.state,
                kp.latitude,
                kp.longitude,
                ROUND(public.ST_Distance(kp.location, rl.location))::bigint AS distance_meters,
                (
                    SELECT COUNT(*)
                    FROM catalog_schema.menu_item mic
                    WHERE mic.kitchen_id = kp.id
                      AND
            """);
        sql.append(eligibleMenuItemPredicates("mic"));
        appendStructuredMenuFilters(sql, "mic", criteria);
        sql.append("\n                ) AS active_menu_item_count\n");
        sql.append(kitchenFilter(criteria));
        sql.append(kitchenOrderBy(sort));
        sql.append(" LIMIT :size OFFSET :offset");
        return jdbcTemplate.query(sql.toString(), parameters, this::mapKitchen);
    }

    private long countNearbyMenuItems(
        ValidatedCriteria criteria,
        MapSqlParameterSource parameters
    ) {
        String sql = REQUEST_LOCATION_CTE + "SELECT COUNT(*) " + menuItemFilter(criteria);
        Long count = jdbcTemplate.queryForObject(sql, parameters, Long.class);
        return count == null ? 0 : count;
    }

    private List<NearbyMenuItemSummaryResponse> queryNearbyMenuItems(
        ValidatedCriteria criteria,
        MenuItemSort sort,
        MapSqlParameterSource parameters
    ) {
        String sql = REQUEST_LOCATION_CTE + """
            SELECT
                mi.id,
                mi.kitchen_id,
                kp.kitchen_name,
                kp.display_name AS kitchen_display_name,
                kp.area_name,
                kp.city,
                kp.state,
                kp.latitude AS kitchen_latitude,
                kp.longitude AS kitchen_longitude,
                ROUND(public.ST_Distance(kp.location, rl.location))::bigint AS distance_meters,
                mi.item_name,
                mi.description,
                mi.category,
                mi.food_type,
                mi.price,
                mi.currency,
                mi.serves_count,
                mi.preparation_time_minutes,
                mi.spice_level,
                mi.unit_package_weight_grams,
                mi.thermobox_required,
                (
                    SELECT mii.public_url
                    FROM catalog_schema.menu_item_image mii
                    WHERE mii.menu_item_id = mi.id
                    ORDER BY mii.is_primary DESC, mii.sort_order ASC, mii.created_at ASC
                    LIMIT 1
                ) AS primary_image_url
            """ + menuItemFilter(criteria) + menuItemOrderBy(sort) + " LIMIT :size OFFSET :offset";
        return jdbcTemplate.query(sql, parameters, this::mapMenuItem);
    }

    private String kitchenFilter(ValidatedCriteria criteria) {
        StringBuilder sql = new StringBuilder("""
            FROM catalog_schema.kitchen_profile kp
            CROSS JOIN request_location rl
            WHERE kp.status = 'ACTIVE'
              AND kp.location IS NOT NULL
              AND public.ST_DWithin(kp.location, rl.location, :radiusMeters)
              AND EXISTS (
                  SELECT 1
                  FROM catalog_schema.menu_item mi
                  WHERE mi.kitchen_id = kp.id
                    AND
            """);
        sql.append(eligibleMenuItemPredicates("mi"));
        appendStructuredMenuFilters(sql, "mi", criteria);
        sql.append("\n              )\n");
        if (criteria.query() != null) {
            sql.append("""
                  AND (
                      to_tsvector(
                          'simple'::regconfig,
                          COALESCE(kp.kitchen_name, '') || ' ' ||
                          COALESCE(kp.display_name, '') || ' ' ||
                          COALESCE(kp.description, '') || ' ' ||
                          COALESCE(kp.area_name, '') || ' ' ||
                          COALESCE(kp.city, '')
                      ) @@ plainto_tsquery('simple'::regconfig, :query)
                      OR EXISTS (
                          SELECT 1
                          FROM catalog_schema.menu_item mis
                          WHERE mis.kitchen_id = kp.id
                            AND
                """);
            sql.append(eligibleMenuItemPredicates("mis"));
            appendStructuredMenuFilters(sql, "mis", criteria);
            sql.append("""
                            AND to_tsvector(
                                'simple'::regconfig,
                                COALESCE(mis.item_name, '') || ' ' ||
                                COALESCE(mis.description, '') || ' ' ||
                                COALESCE(mis.category, '')
                            ) @@ plainto_tsquery('simple'::regconfig, :query)
                      )
                  )
                """);
        }
        return sql.toString();
    }

    private String menuItemFilter(ValidatedCriteria criteria) {
        StringBuilder sql = new StringBuilder("""
            FROM catalog_schema.menu_item mi
            JOIN catalog_schema.kitchen_profile kp ON kp.id = mi.kitchen_id
            CROSS JOIN request_location rl
            WHERE kp.status = 'ACTIVE'
              AND kp.location IS NOT NULL
              AND
            """);
        sql.append(eligibleMenuItemPredicates("mi"));
        sql.append("\n  AND public.ST_DWithin(kp.location, rl.location, :radiusMeters)\n");
        appendStructuredMenuFilters(sql, "mi", criteria);
        if (criteria.query() != null) {
            sql.append("""
                  AND (
                      to_tsvector(
                          'simple'::regconfig,
                          COALESCE(mi.item_name, '') || ' ' ||
                          COALESCE(mi.description, '') || ' ' ||
                          COALESCE(mi.category, '')
                      ) @@ plainto_tsquery('simple'::regconfig, :query)
                      OR to_tsvector(
                          'simple'::regconfig,
                          COALESCE(kp.kitchen_name, '') || ' ' ||
                          COALESCE(kp.display_name, '') || ' ' ||
                          COALESCE(kp.description, '') || ' ' ||
                          COALESCE(kp.area_name, '') || ' ' ||
                          COALESCE(kp.city, '')
                      ) @@ plainto_tsquery('simple'::regconfig, :query)
                  )
                """);
        }
        return sql.toString();
    }

    private static void appendStructuredMenuFilters(
        StringBuilder sql,
        String alias,
        ValidatedCriteria criteria
    ) {
        if (criteria.category() != null) {
            sql.append(" AND LOWER(").append(alias).append(".category) = :category");
        }
        if (criteria.foodType() != null) {
            sql.append(" AND ").append(alias).append(".food_type = :foodType");
        }
        if (criteria.minPrice() != null) {
            sql.append(" AND ").append(alias).append(".price >= :minPrice");
        }
        if (criteria.maxPrice() != null) {
            sql.append(" AND ").append(alias).append(".price <= :maxPrice");
        }
        if (criteria.maxPreparationTimeMinutes() != null) {
            sql.append(" AND ").append(alias)
                .append(".preparation_time_minutes IS NOT NULL AND ")
                .append(alias).append(".preparation_time_minutes <= :maxPreparationTimeMinutes");
        }
        if (criteria.spiceLevel() != null) {
            sql.append(" AND ").append(alias).append(".spice_level = :spiceLevel");
        }
    }

    private static String eligibleMenuItemPredicates(String alias) {
        return ELIGIBLE_MENU_ITEM_PREDICATES.formatted(alias, alias, alias, alias).trim();
    }

    private static String kitchenOrderBy(KitchenSort sort) {
        return switch (sort) {
            case NAME_ASC -> " ORDER BY COALESCE(kp.display_name, kp.kitchen_name) ASC, distance_meters ASC, kp.id ASC";
            case DISTANCE_ASC -> " ORDER BY distance_meters ASC, kp.id ASC";
        };
    }

    private static String menuItemOrderBy(MenuItemSort sort) {
        return switch (sort) {
            case PRICE_ASC -> " ORDER BY mi.price ASC, distance_meters ASC, mi.id ASC";
            case PRICE_DESC -> " ORDER BY mi.price DESC, distance_meters ASC, mi.id ASC";
            case PREPARATION_TIME_ASC ->
                " ORDER BY mi.preparation_time_minutes ASC NULLS LAST, distance_meters ASC, mi.id ASC";
            case NAME_ASC -> " ORDER BY mi.item_name ASC, distance_meters ASC, mi.id ASC";
            case DISTANCE_ASC ->
                " ORDER BY distance_meters ASC, mi.category ASC, mi.item_name ASC, mi.id ASC";
        };
    }

    private MapSqlParameterSource parameters(
        BigDecimal latitude,
        BigDecimal longitude,
        int radiusMeters,
        ValidatedCriteria criteria,
        int page,
        int size
    ) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("latitude", latitude)
            .addValue("longitude", longitude)
            .addValue("radiusMeters", radiusMeters)
            .addValue("size", size)
            .addValue("offset", offset(page, size));
        if (criteria.query() != null) {
            parameters.addValue("query", criteria.query());
        }
        if (criteria.category() != null) {
            parameters.addValue("category", criteria.category());
        }
        if (criteria.foodType() != null) {
            parameters.addValue("foodType", criteria.foodType().name());
        }
        if (criteria.minPrice() != null) {
            parameters.addValue("minPrice", criteria.minPrice());
        }
        if (criteria.maxPrice() != null) {
            parameters.addValue("maxPrice", criteria.maxPrice());
        }
        if (criteria.maxPreparationTimeMinutes() != null) {
            parameters.addValue("maxPreparationTimeMinutes", criteria.maxPreparationTimeMinutes());
        }
        if (criteria.spiceLevel() != null) {
            parameters.addValue("spiceLevel", criteria.spiceLevel().name());
        }
        return parameters;
    }

    private ValidatedCriteria validateCriteria(DiscoveryCriteria criteria) {
        DiscoveryCriteria supplied = criteria == null ? DiscoveryCriteria.empty() : criteria;
        String query = trimToNull(supplied.query());
        String category = trimToNull(supplied.category());

        if (query != null && query.codePointCount(0, query.length()) > MAX_SEARCH_QUERY_LENGTH) {
            throw ApiException.badRequest(
                "SEARCH_QUERY_TOO_LONG",
                "query must be 120 characters or fewer"
            );
        }
        if (category != null && category.codePointCount(0, category.length()) > MAX_CATEGORY_LENGTH) {
            throw ApiException.badRequest(
                "CATEGORY_TOO_LONG",
                "category must be 80 characters or fewer"
            );
        }
        if (supplied.minPrice() != null && supplied.minPrice().signum() < 0) {
            throw ApiException.badRequest("INVALID_MIN_PRICE", "minPrice must be zero or greater");
        }
        if (supplied.maxPrice() != null && supplied.maxPrice().signum() < 0) {
            throw ApiException.badRequest("INVALID_MAX_PRICE", "maxPrice must be zero or greater");
        }
        if (
            supplied.minPrice() != null
                && supplied.maxPrice() != null
                && supplied.minPrice().compareTo(supplied.maxPrice()) > 0
        ) {
            throw ApiException.badRequest(
                "INVALID_PRICE_RANGE",
                "minPrice must be less than or equal to maxPrice"
            );
        }
        if (
            supplied.maxPreparationTimeMinutes() != null
                && supplied.maxPreparationTimeMinutes() <= 0
        ) {
            throw ApiException.badRequest(
                "INVALID_PREPARATION_TIME",
                "maxPreparationTimeMinutes must be greater than zero"
            );
        }

        return new ValidatedCriteria(
            query,
            category == null ? null : category.toLowerCase(Locale.ROOT),
            supplied.foodType(),
            supplied.minPrice(),
            supplied.maxPrice(),
            supplied.maxPreparationTimeMinutes(),
            supplied.spiceLevel()
        );
    }

    private void validateQuery(
        BigDecimal latitude,
        BigDecimal longitude,
        int radiusMeters,
        int page,
        int size
    ) {
        if (latitude == null) {
            throw ApiException.badRequest("LATITUDE_REQUIRED", "Latitude is required for nearby discovery");
        }
        if (longitude == null) {
            throw ApiException.badRequest("LONGITUDE_REQUIRED", "Longitude is required for nearby discovery");
        }
        if (latitude.compareTo(MIN_LATITUDE) < 0 || latitude.compareTo(MAX_LATITUDE) > 0) {
            throw ApiException.badRequest("INVALID_LATITUDE", "Latitude must be between -90 and 90");
        }
        if (longitude.compareTo(MIN_LONGITUDE) < 0 || longitude.compareTo(MAX_LONGITUDE) > 0) {
            throw ApiException.badRequest("INVALID_LONGITUDE", "Longitude must be between -180 and 180");
        }
        if (radiusMeters <= 0) {
            throw ApiException.badRequest("INVALID_RADIUS", "radiusMeters must be greater than zero");
        }
        if (radiusMeters > discoveryProperties.getMaxQueryRadiusMeters()) {
            throw ApiException.badRequest(
                "RADIUS_TOO_LARGE",
                "radiusMeters exceeds the configured discovery query limit"
            );
        }
        if (page < 0) {
            throw ApiException.badRequest("INVALID_PAGE", "page must be zero or greater");
        }
        if (size <= 0 || size > discoveryProperties.getMaxPageSize()) {
            throw ApiException.badRequest(
                "INVALID_PAGE_SIZE",
                "size must be between 1 and the configured maximum page size"
            );
        }
    }

    private NearbyKitchenSummaryResponse mapKitchen(ResultSet rs, int rowNum) throws SQLException {
        return new NearbyKitchenSummaryResponse(
            rs.getObject("id", UUID.class),
            rs.getString("kitchen_name"),
            rs.getString("display_name"),
            rs.getString("description"),
            rs.getString("area_name"),
            rs.getString("city"),
            rs.getString("state"),
            rs.getBigDecimal("latitude"),
            rs.getBigDecimal("longitude"),
            rs.getLong("distance_meters"),
            rs.getLong("active_menu_item_count")
        );
    }

    private NearbyMenuItemSummaryResponse mapMenuItem(ResultSet rs, int rowNum) throws SQLException {
        String spiceLevel = rs.getString("spice_level");
        return new NearbyMenuItemSummaryResponse(
            rs.getObject("id", UUID.class),
            rs.getObject("kitchen_id", UUID.class),
            rs.getString("kitchen_name"),
            rs.getString("kitchen_display_name"),
            rs.getString("area_name"),
            rs.getString("city"),
            rs.getString("state"),
            rs.getBigDecimal("kitchen_latitude"),
            rs.getBigDecimal("kitchen_longitude"),
            rs.getLong("distance_meters"),
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
            rs.getString("primary_image_url")
        );
    }

    private static PageMetadata pageMetadata(int page, int size, long totalElements) {
        long totalPages = totalElements == 0 ? 0 : ((totalElements - 1) / size) + 1;
        boolean hasNext = ((long) page + 1L) * size < totalElements;
        return new PageMetadata(page, size, totalElements, totalPages, hasNext);
    }

    private static long offset(int page, int size) {
        return Math.multiplyExact((long) page, size);
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static Integer integerOrNull(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private static Boolean booleanOrNull(ResultSet rs, String column) throws SQLException {
        boolean value = rs.getBoolean(column);
        return rs.wasNull() ? null : value;
    }

    private record ValidatedCriteria(
        String query,
        String category,
        FoodType foodType,
        BigDecimal minPrice,
        BigDecimal maxPrice,
        Integer maxPreparationTimeMinutes,
        SpiceLevel spiceLevel
    ) {
    }
}
