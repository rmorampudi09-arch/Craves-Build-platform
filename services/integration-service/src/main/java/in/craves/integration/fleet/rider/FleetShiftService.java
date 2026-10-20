package in.craves.integration.fleet.rider;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetProperties;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.rider.FleetRiderModels.ShiftStart;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Going online and offline. A shift hands out an opaque shift credential (32 random bytes, base64url) that the native
 * location service sends instead of a JWT. Only its SHA-256 is stored; it ends with the shift's 12 hours, at
 * /shift/end, or when ops approves another phone, and it works only on POST /locations and POST /devices.
 */
@Service
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled"}, havingValue = "true")
public class FleetShiftService {
    public static final String SHIFT_CREDENTIAL = "X-Craves-Shift-Credential";
    public static final String INSTALLATION_ID = "X-Craves-Installation-Id";
    static final int MAX_SELFIE_BYTES = 5 * 1024 * 1024;
    static final String VERSION = "^[0-9]{1,6}(\\.[0-9]{1,6}){0,3}$";
    /** Closes a shift at its expiry or revocation if that came first, else now; its credential stops working. */
    static final String END_SHIFT = "ended_at = LEAST(now(), credential_expires_at, COALESCE(credential_revoked_at, now())), "
        + "credential_revoked_at = COALESCE(credential_revoked_at, now())";
    // Riding needs these four, each verified by ops with an expiry date (IST) that has not passed.
    private static final String MISSING_DOCUMENTS = """
        SELECT t.type FROM unnest(ARRAY['DRIVING_LICENCE', 'VEHICLE_RC', 'VEHICLE_INSURANCE', 'PUC']) WITH ORDINALITY AS t(type, n)
        WHERE NOT EXISTS (SELECT 1 FROM fleet_schema.rider_document d WHERE d.rider_id = ? AND d.type = t.type
          AND d.status = 'VERIFIED' AND d.expires_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
        ORDER BY t.n""";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;
    private final FleetProperties properties;
    private final FleetStorage storage;

    public FleetShiftService(JdbcTemplate jdbc, FleetProperties properties, FleetStorage storage) {
        this.jdbc = jdbc;
        this.properties = properties;
        this.storage = storage;
    }

    /**
     * Opens a shift for an ACTIVE rider on their bound phone, with the four riding documents current and the app at
     * least minAppVersion. A second start from the same phone while its shift is open (the app lost the credential)
     * hands out a new credential for that shift and keeps the first selfie; from another phone it is 409 SHIFT_OPEN.
     */
    @Transactional
    public ShiftStart start(UUID identityId, String installationId, MultipartFile selfie) {
        ShiftRider rider = jdbc.query("""
                SELECT r.id, r.status, COALESCE(r.min_app_version, ?) AS min_app_version, d.id AS device_id, d.app_version
                FROM fleet_schema.rider r LEFT JOIN fleet_schema.rider_device d ON d.rider_id = r.id AND d.state = 'BOUND'
                WHERE r.identity_id = ?""",
            (row, n) -> new ShiftRider(row.getObject("id", UUID.class), row.getString("status"), row.getString("min_app_version"),
                row.getObject("device_id", UUID.class), row.getString("app_version")), properties.minAppVersion(), identityId)
            .stream().findFirst().orElseThrow(() -> new FleetApiException(403, "NOT_A_RIDER", "This account is not a Craves rider."));
        if (!"ACTIVE".equals(rider.status())) {
            throw new FleetApiException(403, "RIDER_NOT_ACTIVE", "Your account can't go online right now. Open your account page to see why.");
        }
        if (installationId == null || rider.deviceId() == null || !rider.deviceId().equals(deviceId(rider.id(), installationId))) {
            throw deviceNotBound();
        }
        if (versionBelow(rider.appVersion(), rider.minAppVersion())) {
            throw new FleetApiException(403, "APP_UPDATE_REQUIRED", "Update the Craves Rider app to go online.");
        }
        List<String> missing = jdbc.queryForList(MISSING_DOCUMENTS, String.class, rider.id());
        if (!missing.isEmpty()) {
            throw new FleetApiException(403, "DOCUMENTS_EXPIRED", "Renew these before going online: "
                + missing.stream().map(FleetRiderService.DOCUMENT_LABELS::get).collect(Collectors.joining(", "))
                + ". Upload a new photo in Profile and ops will check it.");
        }
        byte[] bytes = selfieBytes(selfie);
        // A shift whose 12 hours ran out, or whose phone ops replaced, is over: close it before opening the next.
        jdbc.update("UPDATE fleet_schema.rider_shift SET " + END_SHIFT + " WHERE rider_id = ? AND ended_at IS NULL "
            + "AND (credential_revoked_at IS NOT NULL OR credential_expires_at <= now())", rider.id());
        String credential = newCredential();
        List<Map<String, Object>> open = jdbc.queryForList("SELECT id, device_id FROM fleet_schema.rider_shift WHERE rider_id = ? "
            + "AND ended_at IS NULL", rider.id());
        if (!open.isEmpty()) {
            if (!rider.deviceId().equals(open.get(0).get("device_id"))) {
                throw shiftOpen();
            }
            Timestamp expires = jdbc.queryForObject("UPDATE fleet_schema.rider_shift SET credential_hash = ? WHERE id = ? "
                + "RETURNING credential_expires_at", Timestamp.class, hash(credential), open.get(0).get("id"));
            return new ShiftStart(credential, expires.toInstant());
        }
        UUID shiftId = UUID.randomUUID();
        String blob = "riders/" + rider.id() + "/selfies/" + shiftId + ".jpg";
        // shortcut: a refused insert after the upload leaves an unreferenced selfie, as document uploads do.
        storage.upload(blob, bytes, "image/jpeg", false);
        try {
            Timestamp expires = jdbc.queryForObject("""
                INSERT INTO fleet_schema.rider_shift (id, rider_id, device_id, credential_hash, credential_expires_at, selfie_blob,
                  selfie_size_bytes) VALUES (?, ?, ?, ?, now() + INTERVAL '12 hours', ?, ?) RETURNING credential_expires_at""",
                Timestamp.class, shiftId, rider.id(), rider.deviceId(), hash(credential), blob, bytes.length);
            return new ShiftStart(credential, expires.toInstant());
        } catch (DuplicateKeyException exception) {
            throw shiftOpen(); // a parallel start opened the shift first
        }
    }

    /** Goes offline and revokes the credential. Idempotent: with no open shift it changes nothing. */
    @Transactional
    public void end(UUID identityId) {
        jdbc.update("UPDATE fleet_schema.rider_shift SET " + END_SHIFT + " WHERE ended_at IS NULL "
            + "AND rider_id = (SELECT id FROM fleet_schema.rider WHERE identity_id = ?)", identityId);
    }

    /** The rider_device id of one app installation: name-based, so the installation id itself is never stored. */
    static UUID deviceId(UUID riderId, String installationId) {
        return UUID.nameUUIDFromBytes(("rider-device/" + riderId + "/" + installationId).getBytes(StandardCharsets.UTF_8));
    }

    /** True when the dotted version is below the minimum, compared part by part as the app does ("1.9" < "1.10"). */
    static boolean versionBelow(String version, String minimum) {
        if (version == null || !version.matches(VERSION)) {
            return true;
        }
        String[] have = version.split("\\.");
        String[] need = minimum.split("\\.");
        for (int i = 0; i < Math.max(have.length, need.length); i++) {
            long left = i < have.length ? Long.parseLong(have[i]) : 0;
            long right = i < need.length ? Long.parseLong(need[i]) : 0;
            if (left != right) {
                return left < right;
            }
        }
        return false;
    }

    static String newCredential() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** SHA-256 of the credential as lowercase hex, the form rider_shift.credential_hash holds. */
    static String hash(String credential) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(credential.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    static FleetApiException deviceNotBound() {
        return FleetApiException.conflict("DEVICE_NOT_BOUND", "This phone isn't approved for your rider account. Call rider support to approve it.");
    }

    private static FleetApiException shiftOpen() {
        return FleetApiException.conflict("SHIFT_OPEN", "You are already online on another phone. Go offline there first.");
    }

    private static byte[] selfieBytes(MultipartFile selfie) {
        if (selfie == null || selfie.isEmpty() || selfie.getSize() > MAX_SELFIE_BYTES) {
            throw invalidSelfie();
        }
        try (InputStream input = selfie.getInputStream()) {
            byte[] bytes = input.readNBytes(MAX_SELFIE_BYTES + 1);
            if (bytes.length != selfie.getSize() || !FleetStorage.signatureMatches("image/jpeg", bytes)) {
                throw invalidSelfie();
            }
            return bytes;
        } catch (IOException exception) {
            throw invalidSelfie();
        }
    }

    private static FleetApiException invalidSelfie() {
        return FleetApiException.unprocessable("SELFIE_INVALID", "Take a clear photo of your face and try again.");
    }

    private record ShiftRider(UUID id, String status, String minAppVersion, UUID deviceId, String appVersion) {
    }
}
