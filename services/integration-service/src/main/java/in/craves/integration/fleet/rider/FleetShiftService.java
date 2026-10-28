package in.craves.integration.fleet.rider;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetProperties;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.engine.FleetEngineFeed;
import in.craves.integration.fleet.rider.FleetRiderModels.DeviceRegistration;
import in.craves.integration.fleet.rider.FleetRiderModels.HeadingHome;
import in.craves.integration.fleet.rider.FleetRiderModels.ShiftPause;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Going online and offline. A shift hands out an opaque shift credential (32 random bytes, base64url) that the native
 * location service sends instead of a JWT. Only its SHA-256 is stored; it ends with the shift's 12 hours, at
 * /shift/end, or when ops approves another phone, and it works only on POST /locations and POST /devices, and on trip
 * steps once craves.fleet.trip-shift-credential-enabled is on (tripIdentity).
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
    /** The rider (a SQL expression, formatted in) has a shift whose credential still works: only such a rider gets or takes an order. */
    public static final String ON_SHIFT = "EXISTS (SELECT 1 FROM fleet_schema.rider_shift h WHERE h.rider_id = %s AND h.ended_at IS NULL "
        + "AND h.credential_revoked_at IS NULL AND h.credential_expires_at > now())";
    /** Phase 4: when the break running on the shift %s ends; NULL when none runs. */
    public static final String BREAK_ENDS = "(SELECT max(b.ends_at) FROM fleet_schema.rider_break b WHERE b.shift_id = %s "
        + "AND b.started_at <= now() AND b.ends_at > now())";
    /** Phase 5: how long heading home lasts once turned on (research R14: an hour; turning it on again extends it). */
    static final int HEADING_HOME_MINUTES = 60;
    // Riding a petrol two-wheeler needs these four, each verified by ops with an expiry date (IST) that has not passed;
    // an electric one needs no PUC and a bicycle none of them (FleetRiderService.REQUIRED_DOCUMENTS).
    private static final String MISSING_DOCUMENTS = """
        SELECT t.type FROM fleet_schema.rider r, unnest(CASE r.vehicle_kind
            WHEN 'BICYCLE' THEN ARRAY[]::text[]
            WHEN 'ELECTRIC' THEN ARRAY['DRIVING_LICENCE', 'VEHICLE_RC', 'VEHICLE_INSURANCE']
            ELSE ARRAY['DRIVING_LICENCE', 'VEHICLE_RC', 'VEHICLE_INSURANCE', 'PUC'] END) WITH ORDINALITY AS t(type, n)
        WHERE r.id = ? AND NOT EXISTS (SELECT 1 FROM fleet_schema.rider_document d WHERE d.rider_id = r.id AND d.type = t.type
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

    /** Phase 5: the fleet engine's feed while craves.fleet.engine.mode is shadow or live, else null. */
    private FleetEngineFeed engineFeed;

    @Autowired(required = false)
    public void setEngineFeed(FleetEngineFeed feed) {
        this.engineFeed = feed.on() ? feed : null;
    }

    /** The fleet engine reads the rider again once this transaction commits (FleetEngineFeed.refresh). */
    private void engineRefresh(UUID identityId) {
        if (engineFeed != null) {
            engineFeed.refreshIdentity(identityId);
        }
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
            engineRefresh(identityId);
            return new ShiftStart(credential, expires.toInstant());
        } catch (DuplicateKeyException exception) {
            throw shiftOpen(); // a parallel start opened the shift first
        }
    }

    /** Goes offline and revokes the credential. Idempotent: with no open shift it changes nothing. */
    @Transactional
    public void end(UUID identityId) {
        jdbc.update(endShifts("rider_id = (SELECT id FROM fleet_schema.rider WHERE identity_id = ?)"), identityId);
        engineRefresh(identityId);
    }

    /**
     * Phase 4: a break of 5 to 60 minutes while staying online. No offers until it ends (a new break replaces the old one),
     * and the time does not count toward a booked slot's guaranteed minimum. An offer still ringing goes to the next rider
     * now, at no cost to this one. 409 NOT_ONLINE without an open shift; 503 RIDER_CHOICES_OFF while rider choices are off.
     */
    @Transactional
    public ShiftPause pause(UUID identityId, Integer minutes) {
        if (!properties.riderChoicesEnabled()) {
            throw FleetRiderService.choicesOff();
        }
        if (minutes == null || minutes < 5 || minutes > 60) {
            throw FleetApiException.invalid("Choose a break of 5 to 60 minutes.");
        }
        List<Map<String, Object>> shift = jdbc.queryForList("SELECT s.id, s.rider_id FROM fleet_schema.rider_shift s "
            + "JOIN fleet_schema.rider r ON r.id = s.rider_id WHERE r.identity_id = ? AND s.ended_at IS NULL AND s.credential_revoked_at IS NULL "
            + "AND s.credential_expires_at > now() FOR UPDATE OF s", identityId);
        if (shift.isEmpty()) {
            throw FleetApiException.conflict("NOT_ONLINE", "Go online first.");
        }
        Object shiftId = shift.get(0).get("id");
        endBreak(shiftId);
        jdbc.update("UPDATE fleet_schema.trip_offer SET state = 'WITHDRAWN', decided_at = now() WHERE rider_id = ? AND state = 'ACTIVE'",
            shift.get(0).get("rider_id"));
        engineRefresh(identityId);
        return new ShiftPause(jdbc.queryForObject("INSERT INTO fleet_schema.rider_break (id, rider_id, shift_id, ends_at) "
            + "VALUES (?, ?, ?, now() + make_interval(mins => ?)) RETURNING ends_at", Timestamp.class, UUID.randomUUID(),
            shift.get(0).get("rider_id"), shiftId, minutes).toInstant());
    }

    /** Ends a break now. Always allowed, so a rider can come back even after rider choices are switched off; repeating is harmless. */
    @Transactional
    public void resume(UUID identityId) {
        jdbc.queryForList("SELECT s.id FROM fleet_schema.rider_shift s JOIN fleet_schema.rider r ON r.id = s.rider_id "
            + "WHERE r.identity_id = ? AND s.ended_at IS NULL", UUID.class, identityId).forEach(this::endBreak);
        engineRefresh(identityId);
    }

    /**
     * Phase 5: heading home for the next HEADING_HOME_MINUTES (turning it on again starts the hour again). Offers then come
     * only for orders that take the rider home (FleetDispatcher.homeNearerM); there is no daily limit, and declining stays
     * free. It ends sooner when the rider turns it off, goes offline or gets within 1 km of home (FleetLocationService).
     * 409 NOT_ONLINE without an open shift; 409 HOME_NOT_SAVED; 503 RIDER_CHOICES_OFF.
     */
    @Transactional
    public HeadingHome headHome(UUID identityId) {
        if (!properties.riderChoicesEnabled()) {
            throw FleetRiderService.choicesOff();
        }
        List<Map<String, Object>> shift = jdbc.queryForList("SELECT s.id, r.id AS rider_id, r.home_saved_at FROM fleet_schema.rider_shift s "
            + "JOIN fleet_schema.rider r ON r.id = s.rider_id WHERE r.identity_id = ? AND s.ended_at IS NULL AND s.credential_revoked_at IS NULL "
            + "AND s.credential_expires_at > now() FOR UPDATE OF s", identityId);
        if (shift.isEmpty()) {
            throw FleetApiException.conflict("NOT_ONLINE", "Go online first.");
        }
        if (shift.get(0).get("home_saved_at") == null) {
            throw FleetApiException.conflict("HOME_NOT_SAVED", "Save your home spot in Profile first.");
        }
        jdbc.update("UPDATE fleet_schema.rider SET home_used_at = now() WHERE id = ?", shift.get(0).get("rider_id"));
        engineRefresh(identityId);
        return new HeadingHome(jdbc.queryForObject("UPDATE fleet_schema.rider_shift SET heading_home_until = now() + make_interval(mins => ?) "
            + "WHERE id = ? RETURNING heading_home_until", Timestamp.class, HEADING_HOME_MINUTES, shift.get(0).get("id")).toInstant());
    }

    /** Ends heading home now. Always allowed, also with rider choices off; repeating is harmless. */
    @Transactional
    public void stopHeadingHome(UUID identityId) {
        jdbc.update("UPDATE fleet_schema.rider_shift s SET heading_home_until = NULL FROM fleet_schema.rider r WHERE r.id = s.rider_id "
            + "AND r.identity_id = ? AND s.ended_at IS NULL AND s.heading_home_until IS NOT NULL", identityId);
        engineRefresh(identityId);
    }

    /** Ends the break running on this shift now, if one is. */
    private void endBreak(Object shiftId) {
        jdbc.update("UPDATE fleet_schema.rider_break SET ends_at = now() WHERE shift_id = ? AND started_at <= now() AND ends_at > now()",
            shiftId);
    }

    /** Ends the open shifts that match the condition and withdraws their riders' open offers, so the next courier is not kept waiting. */
    static String endShifts(String condition) {
        return "WITH ended AS (UPDATE fleet_schema.rider_shift SET " + END_SHIFT + " WHERE ended_at IS NULL AND " + condition
            + " RETURNING rider_id) UPDATE fleet_schema.trip_offer SET state = 'WITHDRAWN', decided_at = now() "
            + "WHERE state = 'ACTIVE' AND rider_id IN (SELECT rider_id FROM ended)";
    }

    /**
     * Registers the phone for offer pushes. The rider's first installation is bound; the same one updates its token,
     * app version and model; any other (a replaced phone coming back too) is kept PENDING_APPROVAL until ops approves
     * it, and the answer is false, which the controller turns into 409 DEVICE_NOT_BOUND after this commits.
     */
    @Transactional
    public boolean registerDevice(UUID identityId, String credential, DeviceRegistration device) {
        if (device == null || device.installationId() == null || !device.installationId().matches("^[A-Za-z0-9._:-]{8,128}$")
            || device.fcmToken() == null || device.fcmToken().isBlank() || device.fcmToken().length() > 4096
            || device.appVersion() == null || !device.appVersion().matches(VERSION)
            || device.model() == null || device.model().isBlank() || device.model().trim().length() > 120) {
            throw FleetApiException.invalid("Check the phone details and try again.");
        }
        // The rider row lock lets one registration at a time decide whether a phone is the first.
        UUID riderId = (credential != null
            ? jdbc.queryForList("SELECT r.id FROM fleet_schema.rider r JOIN fleet_schema.rider_shift s ON s.rider_id = r.id "
                + "WHERE s.credential_hash = CAST(? AS CHAR(64)) AND s.ended_at IS NULL AND s.credential_revoked_at IS NULL "
                + "AND s.credential_expires_at > now() FOR UPDATE OF r", UUID.class, hash(credential))
            : jdbc.queryForList("SELECT id FROM fleet_schema.rider WHERE identity_id = ? FOR UPDATE", UUID.class, identityId))
            .stream().findFirst().orElseThrow(() -> credential != null ? credentialInvalid()
                : new FleetApiException(403, "NOT_A_RIDER", "This account is not a Craves rider."));
        String state = jdbc.queryForObject("""
                INSERT INTO fleet_schema.rider_device AS d (id, rider_id, fcm_token, app_version, model, state)
                VALUES (?, ?, ?, ?, ?, CASE WHEN EXISTS (SELECT 1 FROM fleet_schema.rider_device WHERE rider_id = ? AND state = 'BOUND')
                  THEN 'PENDING_APPROVAL' ELSE 'BOUND' END)
                ON CONFLICT (id) DO UPDATE SET fcm_token = excluded.fcm_token, app_version = excluded.app_version, model = excluded.model,
                  last_seen_at = now(), state = CASE WHEN d.state = 'REPLACED' THEN 'PENDING_APPROVAL' ELSE d.state END
                RETURNING state""",
            String.class, deviceId(riderId, device.installationId()), riderId, device.fcmToken(), device.appVersion(), device.model().trim(),
            riderId);
        return "BOUND".equals(state);
    }

    /**
     * The identity of the rider whose live shift this credential is, for a step on tripId from the phone's native outbox
     * (P2-01, craves.fleet.trip-shift-credential-enabled): only that rider's trip in progress, or one that ended during this
     * shift, so a retried step still gets its first answer. A deactivated rider's credential moves nothing, as their JWT
     * has lost the RIDER role. 401 SHIFT_CREDENTIAL_INVALID; 404 TRIP_NOT_FOUND for any other trip.
     */
    @Transactional(readOnly = true)
    public UUID tripIdentity(String credential, UUID tripId) {
        Map<String, Object> shift = jdbc.queryForList("SELECT r.identity_id, s.started_at FROM fleet_schema.rider_shift s "
                + "JOIN fleet_schema.rider r ON r.id = s.rider_id WHERE s.credential_hash = CAST(? AS CHAR(64)) AND s.ended_at IS NULL "
                + "AND s.credential_revoked_at IS NULL AND s.credential_expires_at > now() AND r.status <> 'DEACTIVATED' "
                + "AND r.identity_id IS NOT NULL", hash(credential))
            .stream().findFirst().orElseThrow(FleetShiftService::credentialInvalid);
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.trip t JOIN fleet_schema.rider r "
            + "ON r.id = t.rider_id WHERE t.id = ? AND r.identity_id = ? AND t.provider = 'CRAVES_FLEET' "
            + "AND (t.state IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP') OR t.finished_at >= ?))", Boolean.class, tripId,
            shift.get("identity_id"), shift.get("started_at")))) {
            throw FleetApiException.notFound("TRIP_NOT_FOUND", "This trip is not yours.");
        }
        return (UUID) shift.get("identity_id");
    }

    static FleetApiException credentialInvalid() {
        return new FleetApiException(401, "SHIFT_CREDENTIAL_INVALID", "Your shift has ended. Go online again.");
    }

    /** The rider_device id of one app installation: name-based, so the installation id itself is never stored. */
    static UUID deviceId(UUID riderId, String installationId) {
        return UUID.nameUUIDFromBytes(("rider-device/" + riderId + "/" + installationId).getBytes(StandardCharsets.UTF_8));
    }

    /** True when the dotted version is below the minimum, compared part by part as the app does ("1.9" < "1.10"). */
    public static boolean versionBelow(String version, String minimum) {
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
