package in.craves.userchef.service;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** "Notify me" for a delivery spot where no home kitchen cooks yet. Sending the notification comes later. */
@Service
public class CustomerLaunchAlertService {
    static final int MAX_ALERTS = 50;
    private static final BigDecimal MAX_LATITUDE = new BigDecimal("90");
    private static final BigDecimal MAX_LONGITUDE = new BigDecimal("180");

    private final JdbcTemplate jdbcTemplate;

    public CustomerLaunchAlertService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public record LaunchAlertRequest(
        @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal latitude,
        @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal longitude,
        @NotBlank @Size(max = 160) String areaName
    ) {
    }

    public record LaunchAlertStatus(boolean subscribed) {
    }

    public LaunchAlertStatus status(CurrentUser user, BigDecimal latitude, BigDecimal longitude) {
        requireCustomer(user);
        requireSpot(latitude, longitude);
        return new LaunchAlertStatus(exists(user.identityId(), key(latitude), key(longitude)));
    }

    @Transactional
    public LaunchAlertStatus subscribe(CurrentUser user, LaunchAlertRequest request) {
        requireCustomer(user);
        requireSpot(request.latitude(), request.longitude());
        UUID identityId = user.identityId();
        BigDecimal latitudeKey = key(request.latitude());
        BigDecimal longitudeKey = key(request.longitude());
        if (exists(identityId, latitudeKey, longitudeKey)) {
            return new LaunchAlertStatus(true);
        }

        // Same per-customer advisory lock as favorites, so parallel taps can't pass the cap together.
        jdbcTemplate.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", identityId.toString());
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM customer_kitchen_launch_alert WHERE identity_id = ?",
            Integer.class,
            identityId
        );
        if (count != null && count >= MAX_ALERTS) {
            throw ApiException.conflict(
                "LAUNCH_ALERTS_LIMIT_REACHED",
                "You can ask to be notified for up to " + MAX_ALERTS + " places"
            );
        }

        jdbcTemplate.update(
            "INSERT INTO customer_kitchen_launch_alert " +
                "(identity_id, latitude_key, longitude_key, latitude, longitude, area_name, created_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, now()) " +
                "ON CONFLICT (identity_id, latitude_key, longitude_key) DO NOTHING",
            identityId,
            latitudeKey,
            longitudeKey,
            request.latitude().setScale(6, RoundingMode.HALF_UP),
            request.longitude().setScale(6, RoundingMode.HALF_UP),
            request.areaName().trim()
        );
        return new LaunchAlertStatus(true);
    }

    static BigDecimal key(BigDecimal coordinate) {
        return coordinate.setScale(3, RoundingMode.HALF_UP);
    }

    private boolean exists(UUID identityId, BigDecimal latitudeKey, BigDecimal longitudeKey) {
        Integer found = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM customer_kitchen_launch_alert " +
                "WHERE identity_id = ? AND latitude_key = ? AND longitude_key = ?",
            Integer.class,
            identityId,
            latitudeKey,
            longitudeKey
        );
        return found != null && found > 0;
    }

    private static void requireSpot(BigDecimal latitude, BigDecimal longitude) {
        if (latitude == null || longitude == null
            || latitude.abs().compareTo(MAX_LATITUDE) > 0
            || longitude.abs().compareTo(MAX_LONGITUDE) > 0) {
            throw ApiException.badRequest("INVALID_LOCATION", "A valid latitude and longitude are required");
        }
    }

    private static void requireCustomer(CurrentUser user) {
        if (user == null || !user.hasRole("CUSTOMER")) {
            throw ApiException.forbidden(
                "CUSTOMER_ROLE_REQUIRED",
                "Kitchen launch alerts require an active CUSTOMER role"
            );
        }
    }
}
