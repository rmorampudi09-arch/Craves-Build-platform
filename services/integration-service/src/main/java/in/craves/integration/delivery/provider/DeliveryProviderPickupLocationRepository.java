package in.craves.integration.delivery.provider;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

@Repository
public class DeliveryProviderPickupLocationRepository {
    private final JdbcTemplate jdbc;

    public DeliveryProviderPickupLocationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<String> findVerifiedExternalLocation(String providerId, UUID pickupLocationReference) {
        if (!StringUtils.hasText(providerId) || pickupLocationReference == null) {
            return Optional.empty();
        }
        return jdbc.query(
            """
                SELECT external_location_code
                FROM delivery_schema.delivery_provider_pickup_location
                WHERE provider_id = ?
                  AND pickup_location_reference = ?
                  AND is_verified = TRUE
                """,
            (rs, rowNum) -> rs.getString("external_location_code"),
            normalize(providerId),
            pickupLocationReference
        ).stream().filter(StringUtils::hasText).findFirst();
    }

    public boolean isVerified(String providerId, UUID pickupLocationReference) {
        return findVerifiedExternalLocation(providerId, pickupLocationReference).isPresent();
    }

    public void upsertVerified(String providerId,
                               UUID pickupLocationReference,
                               String externalLocationCode,
                               String metadataJson) {
        if (!StringUtils.hasText(providerId)
            || pickupLocationReference == null
            || !StringUtils.hasText(externalLocationCode)) {
            throw new IllegalArgumentException("Provider, pickup reference and external location code are required");
        }
        String metadata = StringUtils.hasText(metadataJson) ? metadataJson : "{}";
        jdbc.update(
            """
                INSERT INTO delivery_schema.delivery_provider_pickup_location (
                    provider_id, pickup_location_reference, external_location_code,
                    is_verified, verified_at, metadata, created_at, updated_at
                ) VALUES (?, ?, ?, TRUE, now(), CAST(? AS jsonb), now(), now())
                ON CONFLICT (provider_id, pickup_location_reference) DO UPDATE SET
                    external_location_code = EXCLUDED.external_location_code,
                    is_verified = TRUE,
                    verified_at = now(),
                    metadata = EXCLUDED.metadata,
                    updated_at = now()
                """,
            normalize(providerId),
            pickupLocationReference,
            externalLocationCode.trim(),
            metadata
        );
    }

    public int countVerified(String providerId) {
        if (!StringUtils.hasText(providerId)) {
            return 0;
        }
        Integer count = jdbc.queryForObject(
            """
                SELECT COUNT(*)
                FROM delivery_schema.delivery_provider_pickup_location
                WHERE provider_id = ?
                  AND is_verified = TRUE
                  AND NULLIF(BTRIM(external_location_code), '') IS NOT NULL
                """,
            Integer.class,
            normalize(providerId)
        );
        return count == null ? 0 : count;
    }

    private static String normalize(String providerId) {
        return providerId.trim().toLowerCase(java.util.Locale.ROOT);
    }
}
