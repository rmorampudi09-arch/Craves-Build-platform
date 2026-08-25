package in.craves.catalog.service;

import in.craves.catalog.config.CatalogDiscoveryProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.web.AdvancedSearchDtos.SearchItemResponse;
import in.craves.catalog.web.AdvancedSearchDtos.SearchResponse;
import in.craves.catalog.web.ApiDtos.FoodType;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class AdvancedSearchService {
    private static final BigDecimal MIN_LATITUDE = new BigDecimal("-90");
    private static final BigDecimal MAX_LATITUDE = new BigDecimal("90");
    private static final BigDecimal MIN_LONGITUDE = new BigDecimal("-180");
    private static final BigDecimal MAX_LONGITUDE = new BigDecimal("180");

    private final JdbcTemplate jdbcTemplate;
    private final CatalogDiscoveryProperties discoveryProperties;

    public AdvancedSearchService(JdbcTemplate jdbcTemplate, CatalogDiscoveryProperties discoveryProperties) {
        this.jdbcTemplate = jdbcTemplate;
        this.discoveryProperties = discoveryProperties;
    }

    public SearchResponse search(
        String rawQuery,
        BigDecimal latitude,
        BigDecimal longitude,
        int radiusMeters,
        FoodType foodType,
        String rawCategory,
        BigDecimal maxPrice,
        Integer maxPreparationMinutes,
        int page,
        int size
    ) {
        String query = rawQuery == null ? "" : rawQuery.trim();
        String category = StringUtils.hasText(rawCategory) ? rawCategory.trim() : null;
        validate(query, latitude, longitude, radiusMeters, category, maxPrice, maxPreparationMinutes, page, size);

        StringBuilder sql = new StringBuilder("""
            WITH request_location AS (
                SELECT public.ST_SetSRID(
                    public.ST_MakePoint(CAST(? AS double precision), CAST(? AS double precision)),
                    4326
                )::public.geography AS location
            ), search_query AS (
                SELECT plainto_tsquery('simple'::regconfig, ?) AS query
            )
            SELECT
                mi.id,
                mi.kitchen_id,
                kp.kitchen_name,
                kp.display_name AS kitchen_display_name,
                kp.area_name,
                kp.city,
                ROUND(public.ST_Distance(kp.location, rl.location))::bigint AS distance_meters,
                mi.item_name,
                mi.description,
                mi.category,
                mi.food_type,
                mi.price,
                mi.currency,
                mi.preparation_time_minutes,
                (
                    SELECT mii.public_url
                    FROM catalog_schema.menu_item_image mii
                    WHERE mii.menu_item_id = mi.id
                    ORDER BY mii.is_primary DESC, mii.sort_order ASC, mii.created_at ASC
                    LIMIT 1
                ) AS primary_image_url,
                COUNT(*) OVER() AS total_count,
                (
                    ts_rank_cd(
                        to_tsvector('simple'::regconfig, COALESCE(mi.item_name, '') || ' ' || COALESCE(mi.description, '') || ' ' || COALESCE(mi.category, '')),
                        sq.query
                    ) +
                    ts_rank_cd(
                        to_tsvector('simple'::regconfig, COALESCE(kp.kitchen_name, '') || ' ' || COALESCE(kp.display_name, '') || ' ' || COALESCE(kp.description, '') || ' ' || COALESCE(kp.area_name, '') || ' ' || COALESCE(kp.city, '')),
                        sq.query
                    )
                ) AS search_rank
            FROM catalog_schema.menu_item mi
            JOIN catalog_schema.kitchen_profile kp ON kp.id = mi.kitchen_id
            CROSS JOIN request_location rl
            CROSS JOIN search_query sq
            WHERE kp.status = 'ACTIVE'
              AND kp.location IS NOT NULL
              AND mi.status = 'ACTIVE'
              AND mi.is_available = true
              AND mi.unit_package_weight_grams IS NOT NULL
              AND mi.thermobox_required IS NOT NULL
              AND public.ST_DWithin(kp.location, rl.location, ?)
              AND (
                    to_tsvector('simple'::regconfig, COALESCE(mi.item_name, '') || ' ' || COALESCE(mi.description, '') || ' ' || COALESCE(mi.category, '')) @@ sq.query
                 OR to_tsvector('simple'::regconfig, COALESCE(kp.kitchen_name, '') || ' ' || COALESCE(kp.display_name, '') || ' ' || COALESCE(kp.description, '') || ' ' || COALESCE(kp.area_name, '') || ' ' || COALESCE(kp.city, '')) @@ sq.query
              )
            """);

        List<Object> parameters = new ArrayList<>();
        parameters.add(longitude);
        parameters.add(latitude);
        parameters.add(query);
        parameters.add(radiusMeters);

        if (foodType != null) {
            sql.append(" AND mi.food_type = ?");
            parameters.add(foodType.name());
        }
        if (category != null) {
            sql.append(" AND LOWER(mi.category) = LOWER(?)");
            parameters.add(category);
        }
        if (maxPrice != null) {
            sql.append(" AND mi.price <= ?");
            parameters.add(maxPrice);
        }
        if (maxPreparationMinutes != null) {
            sql.append(" AND mi.preparation_time_minutes IS NOT NULL AND mi.preparation_time_minutes <= ?");
            parameters.add(maxPreparationMinutes);
        }

        sql.append(" ORDER BY search_rank DESC, distance_meters ASC, mi.item_name ASC, mi.id ASC LIMIT ? OFFSET ?");
        parameters.add(size);
        parameters.add(Math.multiplyExact((long) page, size));

        List<SearchRow> rows = jdbcTemplate.query(sql.toString(), this::mapRow, parameters.toArray());
        long totalElements = rows.isEmpty() ? 0 : rows.getFirst().totalCount();
        long totalPages = totalElements == 0 ? 0 : ((totalElements - 1) / size) + 1;
        boolean hasNext = ((long) page + 1L) * size < totalElements;
        return new SearchResponse(
            page,
            size,
            totalElements,
            totalPages,
            hasNext,
            rows.stream().map(SearchRow::item).toList()
        );
    }

    private SearchRow mapRow(ResultSet rs, int rowNum) throws SQLException {
        String foodType = rs.getString("food_type");
        return new SearchRow(
            new SearchItemResponse(
                rs.getObject("id", UUID.class),
                rs.getObject("kitchen_id", UUID.class),
                rs.getString("kitchen_name"),
                rs.getString("kitchen_display_name"),
                rs.getString("area_name"),
                rs.getString("city"),
                rs.getLong("distance_meters"),
                rs.getString("item_name"),
                rs.getString("description"),
                rs.getString("category"),
                FoodType.valueOf(foodType),
                rs.getBigDecimal("price"),
                rs.getString("currency"),
                integerOrNull(rs, "preparation_time_minutes"),
                rs.getString("primary_image_url")
            ),
            rs.getLong("total_count")
        );
    }

    private void validate(
        String query,
        BigDecimal latitude,
        BigDecimal longitude,
        int radiusMeters,
        String category,
        BigDecimal maxPrice,
        Integer maxPreparationMinutes,
        int page,
        int size
    ) {
        if (query.length() < 2 || query.length() > 120) {
            throw ApiException.badRequest("INVALID_SEARCH_QUERY", "Search query must contain between 2 and 120 characters.");
        }
        if (latitude == null || latitude.compareTo(MIN_LATITUDE) < 0 || latitude.compareTo(MAX_LATITUDE) > 0) {
            throw ApiException.badRequest("INVALID_LATITUDE", "Latitude must be between -90 and 90.");
        }
        if (longitude == null || longitude.compareTo(MIN_LONGITUDE) < 0 || longitude.compareTo(MAX_LONGITUDE) > 0) {
            throw ApiException.badRequest("INVALID_LONGITUDE", "Longitude must be between -180 and 180.");
        }
        if (radiusMeters <= 0 || radiusMeters > discoveryProperties.getMaxQueryRadiusMeters()) {
            throw ApiException.badRequest("INVALID_RADIUS", "radiusMeters is outside the configured discovery limit.");
        }
        if (category != null && category.length() > 80) {
            throw ApiException.badRequest("INVALID_CATEGORY", "Category is too long.");
        }
        if (maxPrice != null && maxPrice.signum() <= 0) {
            throw ApiException.badRequest("INVALID_MAX_PRICE", "maxPrice must be greater than zero.");
        }
        if (maxPreparationMinutes != null && maxPreparationMinutes <= 0) {
            throw ApiException.badRequest("INVALID_PREPARATION_TIME", "maxPreparationMinutes must be greater than zero.");
        }
        if (page < 0 || size <= 0 || size > discoveryProperties.getMaxPageSize()) {
            throw ApiException.badRequest("INVALID_PAGINATION", "Requested page or page size is invalid.");
        }
    }

    private static Integer integerOrNull(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private record SearchRow(SearchItemResponse item, long totalCount) {}
}
