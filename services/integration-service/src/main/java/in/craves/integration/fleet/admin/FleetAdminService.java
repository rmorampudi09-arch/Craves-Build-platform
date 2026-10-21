package in.craves.integration.fleet.admin;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetRoleClient;
import in.craves.integration.fleet.FleetRules;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminModels.AuditEntry;
import in.craves.integration.fleet.admin.FleetAdminModels.AuditPage;
import in.craves.integration.fleet.admin.FleetAdminModels.FileContent;
import in.craves.integration.fleet.admin.FleetAdminModels.NewRider;
import in.craves.integration.fleet.admin.FleetAdminModels.PayoutAccount;
import in.craves.integration.fleet.admin.FleetAdminModels.PayoutAccountInput;
import in.craves.integration.fleet.admin.FleetAdminModels.RiderDetail;
import in.craves.integration.fleet.admin.FleetAdminModels.RiderDevice;
import in.craves.integration.fleet.admin.FleetAdminModels.RiderDocument;
import in.craves.integration.fleet.admin.FleetAdminModels.RiderHeader;
import in.craves.integration.fleet.admin.FleetAdminModels.RiderPage;
import in.craves.integration.fleet.admin.FleetAdminModels.RiderSummary;
import in.craves.integration.fleet.admin.FleetAdminModels.RiderVehicle;
import in.craves.integration.fleet.admin.FleetAdminModels.SelfieQueue;
import in.craves.integration.fleet.admin.FleetAdminModels.SelfieReview;
import in.craves.integration.fleet.admin.FleetAdminModels.Shift;
import in.craves.integration.fleet.admin.FleetAdminModels.StatusEvent;
import in.craves.integration.fleet.admin.FleetAdminModels.StatusEventInput;
import in.craves.integration.fleet.admin.FleetAdminModels.VehicleInput;
import in.craves.integration.fleet.admin.FleetAdminModels.ZoneBanner;
import in.craves.integration.payout.bank.BankDataCipher;
import in.craves.integration.payout.bank.BankOnboardingModels;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ops actions on riders. Every action is audited (actor, action, target, reason, time) in fleet_schema.admin_audit.
 * A mutation's audit row also stores its Idempotency-Key, request hash and response in the same transaction, so a
 * retry with the same key and body returns the first result and a different body is 409 IDEMPOTENCY_KEY_REUSED.
 */
@Service
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetAdminService {
    static final int RIDER_PAGE = 50;
    static final int AUDIT_PAGE = 100;
    private static final Set<String> STATUSES = Set.of("NOT_RIDER", "PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED");
    private static final Set<String> LANGUAGES = Set.of("en", "te", "hi");
    private static final Set<String> KINDS = Set.of("SAFETY_PAUSE", "NOTICE", "RESTORE", "DEACTIVATE");
    private static final Set<String> SELFIE_STATES = Set.of("PENDING", "APPROVED", "REJECTED");
    static final String RIDER_PHONE = "^\\+91[6-9][0-9]{9}$";
    // The four riding documents: verified only with the expiry date printed on them (/shift/start checks it).
    private static final Set<String> EXPIRING_DOCUMENTS = Set.of("DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PUC");
    static final String VEHICLE_REGISTRATION = "^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$";
    // Ends every showing banner. The GREATEST keeps ends_at after starts_at should a banner start in the same instant.
    private static final String END_BANNERS =
        "UPDATE fleet_schema.ops_banner SET ends_at = GREATEST(now(), starts_at + INTERVAL '1 microsecond') WHERE ends_at > now()";
    private static final String SUMMARY = """
        SELECT r.id, r.name, r.phone, r.status, r.created_at, r.language, r.vehicle_reg_number,
          (SELECT count(*) FROM fleet_schema.rider_document d WHERE d.rider_id = r.id AND d.status = 'PENDING') AS pending_documents,
          EXISTS (SELECT 1 FROM fleet_schema.rider_device v WHERE v.rider_id = r.id AND v.state = 'PENDING_APPROVAL') AS pending_device
        FROM fleet_schema.rider r
        """;
    private static final String DOCUMENT = "SELECT id, type, " + FleetRules.DOCUMENT_STATUS_SQL + " AS status, expires_on, reason, "
        + "reviewed_by_name, reviewed_at, uploaded_at FROM fleet_schema.rider_document ";
    private static final String DEVICE = "SELECT id, model, app_version, state, first_seen_at, approved_by_name, approved_at "
        + "FROM fleet_schema.rider_device ";
    private static final String EVENT = "SELECT id, kind, reason, evidence_summary, deadline, review_by, appeal_phone, approver_name, "
        + "created_at, status_after FROM fleet_schema.rider_status_event ";
    private static final String SELFIE = "SELECT s.id, s.rider_id, r.name, s.started_at, s.selfie_state, s.selfie_reason, "
        + "s.selfie_reviewed_by_name, s.selfie_reviewed_at FROM fleet_schema.rider_shift s JOIN fleet_schema.rider r ON r.id = s.rider_id ";

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final FleetStorage storage;
    private final FleetRoleClient roles;
    private final BankDataCipher cipher;

    public FleetAdminService(JdbcTemplate jdbc, ObjectMapper json, FleetStorage storage, FleetRoleClient roles, BankDataCipher cipher) {
        this.jdbc = jdbc;
        this.json = json;
        this.storage = storage;
        this.roles = roles;
        this.cipher = cipher;
    }

    @Transactional(readOnly = true)
    public RiderPage listRiders(String status, String search, String cursor) {
        if (status != null && !STATUSES.contains(status)) {
            throw FleetApiException.invalid("Choose a valid status.");
        }
        if (search != null && search.length() > 80) {
            throw FleetApiException.invalid("Search with at most 80 characters.");
        }
        StringBuilder where = new StringBuilder(" WHERE true");
        List<Object> args = new ArrayList<>();
        if (status != null) {
            where.append(" AND r.status = ?");
            args.add(status);
        }
        String term = search == null ? "" : search.trim();
        if (term.matches("[0-9 ]+")) {
            where.append(" AND r.phone LIKE ?");
            args.add("%" + term.replace(" ", ""));
        } else if (!term.isEmpty()) {
            where.append(" AND r.name ILIKE ?");
            args.add("%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        Cursor after = Cursor.parse(cursor);
        if (after != null) {
            where.append(" AND (r.created_at, r.id) < (?, ?)");
            args.add(Timestamp.from(after.at()));
            args.add(after.id());
        }
        List<RiderSummary> riders = jdbc.query(SUMMARY + where + " ORDER BY r.created_at DESC, r.id DESC LIMIT " + (RIDER_PAGE + 1),
            (row, n) -> summary(row), args.toArray());
        String next = null;
        if (riders.size() > RIDER_PAGE) {
            riders = riders.subList(0, RIDER_PAGE);
            RiderSummary last = riders.get(RIDER_PAGE - 1);
            next = new Cursor(last.createdAt(), last.riderId()).encode();
        }
        return new RiderPage(riders, next);
    }

    @Transactional
    public Object createRider(Admin admin, UUID key, NewRider input) {
        String name = input == null || input.name() == null ? "" : input.name().trim();
        if (name.length() < 2 || name.length() > 120) {
            throw FleetApiException.invalid("Enter the rider's name as on their documents.");
        }
        if (input.phone() == null || !input.phone().matches(RIDER_PHONE)) {
            throw FleetApiException.invalid("Enter the phone as +91 and 10 digits.");
        }
        if (!LANGUAGES.contains(input.language())) {
            throw FleetApiException.invalid("Choose English, Telugu or Hindi.");
        }
        return once(admin, key, "RIDER_CREATED", write(input), () -> {
            UUID id = UUID.randomUUID();
            try {
                jdbc.update("INSERT INTO fleet_schema.rider (id, name, phone, language, created_by) VALUES (?, ?, ?, ?, ?)",
                    id, name, input.phone(), input.language(), admin.id());
            } catch (DuplicateKeyException exception) {
                throw FleetApiException.conflict("PHONE_IN_USE", "Another rider already has this phone number.");
            }
            RiderHeader rider = header(id);
            return new Done(new RiderSummary(rider.riderId(), rider.name(), rider.phoneMasked(), rider.status(), 0, false,
                rider.createdAt()), id, id.toString(), "Created rider " + name + " (" + rider.phoneMasked() + ").");
        });
    }

    @Transactional(readOnly = true)
    public RiderDetail getRider(UUID riderId) {
        RiderHeader rider = header(riderId);
        List<RiderDocument> documents = jdbc.query(DOCUMENT + "WHERE rider_id = ? ORDER BY uploaded_at DESC LIMIT 20",
            (row, n) -> document(row), riderId);
        List<RiderDevice> devices = jdbc.query(DEVICE + "WHERE rider_id = ? ORDER BY first_seen_at DESC LIMIT 10",
            (row, n) -> device(row), riderId);
        PayoutAccount account = jdbc.query("SELECT method, masked_account, ifsc, holder_name, set_by_name, set_at "
            + "FROM fleet_schema.rider_payout_account WHERE rider_id = ? AND state = 'ACTIVE'", (row, n) -> payoutAccount(row), riderId)
            .stream().findFirst().orElse(null);
        List<Shift> shifts = jdbc.query("SELECT id, started_at, ended_at, selfie_state, selfie_reason, selfie_reviewed_by_name, "
            + "in_zone_seconds FROM fleet_schema.rider_shift WHERE rider_id = ? ORDER BY started_at DESC LIMIT 20",
            (row, n) -> new Shift(row.getObject("id", UUID.class), instant(row, "started_at"), instant(row, "ended_at"),
                row.getString("selfie_state"), row.getString("selfie_reason"), row.getString("selfie_reviewed_by_name"),
                row.getInt("in_zone_seconds")), riderId);
        List<StatusEvent> events = jdbc.query(EVENT + "WHERE rider_id = ? ORDER BY created_at DESC LIMIT 100",
            (row, n) -> statusEvent(row), riderId);
        return new RiderDetail(rider, documents, devices, account, shifts, events);
    }

    @Transactional
    public FileContent documentContent(Admin admin, UUID riderId, UUID documentId) {
        Map<String, Object> row = jdbc.queryForList("SELECT type, blob_name, content_type, size_bytes FROM fleet_schema.rider_document "
            + "WHERE id = ? AND rider_id = ?", documentId, riderId).stream().findFirst()
            .orElseThrow(() -> FleetApiException.notFound("DOCUMENT_NOT_FOUND", "No such document for this rider."));
        String contentType = (String) row.get("content_type");
        byte[] bytes = storage.download((String) row.get("blob_name"), contentType, ((Number) row.get("size_bytes")).longValue());
        audit(admin, "DOCUMENT_VIEWED", riderId, documentId.toString(), "Viewed the " + row.get("type") + " file.", null, null, null);
        return new FileContent(contentType, bytes);
    }

    /** Verifies a PENDING document with the expiry date the reviewer read on it (required for the four riding documents). */
    @Transactional
    public Object approveDocument(Admin admin, UUID key, UUID riderId, UUID documentId, LocalDate expiresOn) {
        return once(admin, key, "DOCUMENT_VERIFIED", riderId + "/" + documentId + "\n" + expiresOn, () -> {
            String type = jdbc.queryForList("SELECT type FROM fleet_schema.rider_document WHERE id = ? AND rider_id = ?", String.class,
                documentId, riderId).stream().findFirst()
                .orElseThrow(() -> FleetApiException.notFound("DOCUMENT_NOT_FOUND", "No such document for this rider."));
            if (expiresOn == null && EXPIRING_DOCUMENTS.contains(type)) {
                throw FleetApiException.unprocessable("EXPIRY_REQUIRED", "Enter the expiry date printed on the document.");
            }
            int updated = jdbc.update("UPDATE fleet_schema.rider_document SET status = 'VERIFIED', reason = NULL, expires_on = ?, reviewed_by = ?, "
                + "reviewed_by_name = ?, reviewed_at = now() WHERE id = ? AND rider_id = ? AND status = 'PENDING'",
                expiresOn, admin.id(), admin.name(), documentId, riderId);
            RiderDocument document = reviewedDocument(updated, riderId, documentId);
            return new Done(document, riderId, documentId.toString(), "Verified the " + document.type()
                + (expiresOn == null ? "." : ", valid until " + expiresOn + "."));
        });
    }

    /** The vehicle the rider's profile shows. The registration number is stored in full, answered and audited masked. */
    @Transactional
    public Object setVehicle(Admin admin, UUID key, UUID riderId, VehicleInput input) {
        String label = input == null || input.label() == null ? "" : input.label().trim();
        String registration = input == null || input.regNumber() == null ? "" : input.regNumber().replaceAll("[\\s-]", "").toUpperCase(Locale.ROOT);
        if (label.length() < 2 || label.length() > 60) {
            throw FleetApiException.invalid("Enter the vehicle, like Honda Activa 6G.");
        }
        if (!registration.matches(VEHICLE_REGISTRATION)) {
            throw FleetApiException.invalid("Enter the registration number as on the RC, like TS09EA1234.");
        }
        return once(admin, key, "VEHICLE_SET", riderId + "\n" + label + "\n" + registration, () -> {
            if (jdbc.update("UPDATE fleet_schema.rider SET vehicle_label = ?, vehicle_reg_number = ?, updated_at = now() WHERE id = ?",
                label, registration, riderId) == 0) {
                throw riderNotFound();
            }
            RiderVehicle vehicle = new RiderVehicle(label, FleetRules.maskVehicle(registration));
            return new Done(vehicle, riderId, riderId.toString(), "Set the vehicle to " + label + " (" + vehicle.regNumberMasked() + ").");
        });
    }

    /** The banner riders see now, or null. */
    @Transactional(readOnly = true)
    public ZoneBanner banner() {
        return jdbc.query("SELECT tone, text, ends_at FROM fleet_schema.ops_banner WHERE starts_at <= now() AND ends_at > now() "
                + "ORDER BY starts_at DESC LIMIT 1", (row, n) -> new ZoneBanner(row.getString("tone"), row.getString("text"), instant(row, "ends_at")))
            .stream().findFirst().orElse(null);
    }

    /** Shows the banner on every rider's Home from now until until, replacing any earlier one. */
    @Transactional
    public Object setBanner(Admin admin, UUID key, ZoneBanner input) {
        if (input == null || !"info".equals(input.tone()) && !"warning".equals(input.tone())) {
            throw FleetApiException.invalid("Choose info or warning.");
        }
        String text = input.text() == null ? "" : input.text().trim();
        if (text.isEmpty() || text.length() > 160) {
            throw FleetApiException.invalid("Write the banner in 1 to 160 characters.");
        }
        if (input.until() == null || input.until().isBefore(Instant.now().plusSeconds(60))) {
            throw FleetApiException.invalid("Choose an end time at least a minute from now.");
        }
        ZoneBanner banner = new ZoneBanner(input.tone(), text, input.until().truncatedTo(ChronoUnit.MICROS));
        return once(admin, key, "BANNER_SET", write(banner), () -> {
            jdbc.update(END_BANNERS);
            jdbc.update("INSERT INTO fleet_schema.ops_banner (id, tone, text, starts_at, ends_at) VALUES (?, ?, ?, now(), ?)", UUID.randomUUID(),
                banner.tone(), banner.text(), Timestamp.from(banner.until()));
            return new Done(banner, null, "banner", "Showing a " + banner.tone() + " banner until " + banner.until() + ": " + text);
        });
    }

    /** Stops showing the banner; clearing when none shows changes nothing. */
    @Transactional
    public void clearBanner(Admin admin, UUID key) {
        once(admin, key, "BANNER_CLEARED", "", () -> new Done(null, null, "banner",
            jdbc.update(END_BANNERS) == 0 ? "Cleared the banner; none was showing." : "Cleared the banner."));
    }

    @Transactional
    public Object rejectDocument(Admin admin, UUID key, UUID riderId, UUID documentId, String reason) {
        String text = reason(reason);
        return once(admin, key, "DOCUMENT_REJECTED", riderId + "/" + documentId + "\n" + text, () -> {
            int updated = jdbc.update("UPDATE fleet_schema.rider_document SET status = 'REJECTED', reason = ?, reviewed_by = ?, "
                + "reviewed_by_name = ?, reviewed_at = now() WHERE id = ? AND rider_id = ? AND status = 'PENDING'",
                text, admin.id(), admin.name(), documentId, riderId);
            RiderDocument document = reviewedDocument(updated, riderId, documentId);
            return new Done(document, riderId, documentId.toString(), "Rejected the " + document.type() + ": " + text);
        });
    }

    @Transactional
    public Object approveDevice(Admin admin, UUID key, UUID riderId, UUID deviceId) {
        return once(admin, key, "DEVICE_APPROVED", riderId + "/" + deviceId, () -> {
            lockRider(riderId);
            String state = jdbc.queryForList("SELECT state FROM fleet_schema.rider_device WHERE id = ? AND rider_id = ? FOR UPDATE",
                String.class, deviceId, riderId).stream().findFirst()
                .orElseThrow(() -> FleetApiException.notFound("DEVICE_NOT_FOUND", "No such phone for this rider."));
            if (!"PENDING_APPROVAL".equals(state)) {
                throw FleetApiException.conflict("DEVICE_NOT_PENDING", "This phone is not waiting for approval.");
            }
            // The old phone goes first: one bound phone per rider (rider_device_one_bound).
            jdbc.update("UPDATE fleet_schema.rider_device SET state = 'REPLACED' WHERE rider_id = ? AND state = 'BOUND'", riderId);
            jdbc.update("UPDATE fleet_schema.rider_device SET state = 'BOUND', approved_by = ?, approved_by_name = ?, approved_at = now() "
                + "WHERE id = ?", admin.id(), admin.name(), deviceId);
            jdbc.update("UPDATE fleet_schema.rider_shift SET credential_revoked_at = now() WHERE rider_id = ? AND ended_at IS NULL "
                + "AND credential_revoked_at IS NULL", riderId);
            RiderDevice device = jdbc.queryForObject(DEVICE + "WHERE id = ?", (row, n) -> device(row), deviceId);
            return new Done(device, riderId, deviceId.toString(), "Approved a new phone (" + device.model() + "); the old phone is replaced.");
        });
    }

    @Transactional
    public Object setPayoutAccount(Admin admin, UUID key, UUID riderId, PayoutAccountInput input) {
        if (input == null || !Boolean.TRUE.equals(input.verifiedInPerson())) {
            throw FleetApiException.invalid("Tick that you saw the rider and their ID in person.");
        }
        String holder = input.holderName() == null ? "" : input.holderName().trim();
        if (holder.length() < 2 || holder.length() > 120) {
            throw FleetApiException.invalid("Enter the account holder's name.");
        }
        boolean upi = "UPI".equals(input.method());
        if (upi ? input.upiId() == null || !input.upiId().matches("^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$") || input.accountNumber() != null
            : !"BANK".equals(input.method()) || input.accountNumber() == null || !input.accountNumber().matches("^[0-9]{9,18}$")
                || input.ifsc() == null || !input.ifsc().matches("^[A-Z]{4}0[A-Z0-9]{6}$") || input.upiId() != null) {
            throw FleetApiException.invalid("UPI needs a UPI ID like name@bank; a bank account needs its number and IFSC.");
        }
        if (!cipher.ready()) {
            throw new FleetApiException(503, "PAYOUT_ACCOUNT_STORAGE_UNAVAILABLE", "Encrypted storage for payout accounts is not ready.");
        }
        String account = upi ? input.upiId().toLowerCase(Locale.ROOT) : input.accountNumber();
        String ifsc = upi ? null : input.ifsc();
        // The same account at the same bank, whatever branch IFSC was typed.
        String fingerprint = cipher.accountFingerprint(upi ? "UPI:" + account : "BANK:" + ifsc.substring(0, 4) + ":" + account);
        // The hash of a request carries the keyed fingerprint, never the account number itself.
        String request = riderId + "\n" + input.method() + "\n" + fingerprint + "\n" + ifsc + "\n" + holder;
        return once(admin, key, "PAYOUT_ACCOUNT_SET", request, () -> {
            String kycName = lockRider(riderId).name();
            if (!FleetRules.sameName(holder, kycName)) {
                throw FleetApiException.unprocessable("HOLDER_NAME_MISMATCH", "The account holder's name differs from the rider's KYC name.");
            }
            if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_payout_account "
                + "WHERE fingerprint = ? AND rider_id <> ?)", Boolean.class, fingerprint, riderId))) {
                throw notUnique();
            }
            UUID id = UUID.randomUUID();
            String masked = upi ? FleetRules.maskUpi(account) : FleetRules.maskAccount(account);
            // BankDataCipher's chef-bank record: the rider is the owner, the UPI ID goes where the account number goes.
            String encrypted = cipher.encrypt(id, riderId,
                new BankOnboardingModels.Details(riderId, null, holder, null, null, account, ifsc));
            jdbc.update("UPDATE fleet_schema.rider_payout_account SET state = 'REPLACED' WHERE rider_id = ? AND state = 'ACTIVE'", riderId);
            try {
                jdbc.update("INSERT INTO fleet_schema.rider_payout_account (id, rider_id, method, encrypted_details, fingerprint, "
                    + "masked_account, ifsc, holder_name, verified_in_person, set_by, set_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, true, ?, ?)",
                    id, riderId, input.method(), encrypted, fingerprint, masked, ifsc, holder, admin.id(), admin.name());
            } catch (DuplicateKeyException exception) {
                throw notUnique();
            }
            PayoutAccount saved = jdbc.queryForObject("SELECT method, masked_account, ifsc, holder_name, set_by_name, set_at "
                + "FROM fleet_schema.rider_payout_account WHERE id = ?", (row, n) -> payoutAccount(row), id);
            return new Done(saved, riderId, id.toString(), "Set the payout account to " + input.method() + " " + masked
                + ", seen in person.");
        });
    }

    @Transactional
    public Object createStatusEvent(Admin admin, UUID key, UUID riderId, StatusEventInput input) {
        if (input == null || !KINDS.contains(input.kind())) {
            throw FleetApiException.invalid("Choose SAFETY_PAUSE, NOTICE, RESTORE or DEACTIVATE.");
        }
        String reason = reason(input.reason());
        String evidence = input.evidenceSummary() == null ? "" : input.evidenceSummary().trim();
        if (evidence.length() < 3 || evidence.length() > 2000) {
            throw FleetApiException.invalid("Summarise the evidence in 3 to 2,000 characters.");
        }
        if (input.appealPhone() != null && !input.appealPhone().matches("^\\+91[0-9]{10}$")) {
            throw FleetApiException.invalid("Enter the appeal phone as +91 and 10 digits.");
        }
        return once(admin, key, "STATUS_" + input.kind(), riderId + "\n" + write(input), () -> {
            LockedRider rider = lockRider(riderId);
            Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
            String after = FleetRules.statusAfter(input.kind(), rider.status(), input.deadline(), input.reviewBy(),
                input.appealPhone(), openNoticeDeadline(riderId), now);
            boolean activates = "ACTIVE".equals(after) && !"ACTIVE".equals(rider.status());
            if (activates && rider.identityId() == null) {
                throw FleetApiException.conflict("INVALID_STATUS_TRANSITION", "The rider must sign in to the app once before activation.");
            }
            Instant deadline = "NOTICE".equals(input.kind()) ? input.deadline() : null;
            Instant reviewBy = "SAFETY_PAUSE".equals(input.kind()) ? input.reviewBy() : null;
            UUID id = UUID.randomUUID();
            jdbc.update("INSERT INTO fleet_schema.rider_status_event (id, rider_id, kind, reason, evidence_summary, deadline, review_by, "
                + "appeal_phone, approver_id, approver_name, status_before, status_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, riderId, input.kind(), reason, evidence, timestamp(deadline), timestamp(reviewBy), input.appealPhone(),
                admin.id(), admin.name(), rider.status(), after, Timestamp.from(now));
            if (!after.equals(rider.status())) {
                jdbc.update("UPDATE fleet_schema.rider SET status = ?, updated_at = now() WHERE id = ?", after, riderId);
            }
            // The remote role change comes last, so its failure rolls the whole decision back.
            if (activates) {
                roles.grant(rider.identityId(), riderId);
            } else if ("DEACTIVATED".equals(after) && rider.identityId() != null) {
                roles.revoke(rider.identityId(), riderId);
            }
            StatusEvent event = new StatusEvent(id, input.kind(), reason, evidence, deadline, reviewBy, input.appealPhone(),
                admin.name(), now, after);
            return new Done(event, riderId, id.toString(), input.kind() + " (" + rider.status() + " to " + after + "): " + reason);
        });
    }

    @Transactional(readOnly = true)
    public SelfieQueue selfieReviews(String state) {
        if (!SELFIE_STATES.contains(state)) {
            throw FleetApiException.invalid("Choose PENDING, APPROVED or REJECTED.");
        }
        return new SelfieQueue(jdbc.query(SELFIE + "WHERE s.selfie_blob IS NOT NULL AND s.selfie_state = ? ORDER BY s.started_at, s.id "
            + "LIMIT 200", (row, n) -> selfie(row), state));
    }

    @Transactional
    public FileContent selfie(Admin admin, UUID shiftId) {
        Map<String, Object> row = jdbc.queryForList("SELECT rider_id, selfie_blob, selfie_size_bytes FROM fleet_schema.rider_shift "
            + "WHERE id = ? AND selfie_blob IS NOT NULL", shiftId).stream().findFirst()
            .orElseThrow(() -> FleetApiException.notFound("SELFIE_NOT_FOUND", "No selfie for this shift."));
        byte[] bytes = storage.download((String) row.get("selfie_blob"), "image/jpeg", ((Number) row.get("selfie_size_bytes")).longValue());
        audit(admin, "SELFIE_VIEWED", (UUID) row.get("rider_id"), shiftId.toString(), "Viewed the go-online selfie.", null, null, null);
        return new FileContent("image/jpeg", bytes);
    }

    @Transactional
    public Object reviewSelfie(Admin admin, UUID key, UUID shiftId, boolean approve, String reason) {
        String text = approve ? null : reason(reason);
        String action = approve ? "SELFIE_APPROVED" : "SELFIE_REJECTED";
        return once(admin, key, action, shiftId + "\n" + text, () -> {
            // Records the review only: it never ends the shift or blocks the rider.
            int updated = jdbc.update("UPDATE fleet_schema.rider_shift SET selfie_state = ?, selfie_reason = ?, selfie_reviewed_by = ?, "
                + "selfie_reviewed_by_name = ?, selfie_reviewed_at = now() WHERE id = ? AND selfie_blob IS NOT NULL AND selfie_state = 'PENDING'",
                approve ? "APPROVED" : "REJECTED", text, admin.id(), admin.name(), shiftId);
            List<SelfieReview> found = jdbc.query(SELFIE + "WHERE s.id = ? AND s.selfie_blob IS NOT NULL", (row, n) -> selfie(row), shiftId);
            if (found.isEmpty()) {
                throw FleetApiException.notFound("SELFIE_NOT_FOUND", "No selfie for this shift.");
            }
            if (updated == 0) {
                throw FleetApiException.conflict("SELFIE_NOT_PENDING", "This selfie was already reviewed.");
            }
            SelfieReview review = found.get(0);
            return new Done(review, review.riderId(), shiftId.toString(), approve ? "Approved the go-online selfie."
                : "Rejected the go-online selfie: " + text);
        });
    }

    @Transactional(readOnly = true)
    public AuditPage audit(UUID riderId, String cursor) {
        StringBuilder where = new StringBuilder(" WHERE true");
        List<Object> args = new ArrayList<>();
        if (riderId != null) {
            where.append(" AND rider_id = ?");
            args.add(riderId);
        }
        Cursor after = Cursor.parse(cursor);
        if (after != null) {
            where.append(" AND (at, id) < (?, ?)");
            args.add(Timestamp.from(after.at()));
            args.add(after.id());
        }
        List<AuditEntry> entries = jdbc.query("SELECT id, at, actor_name, action, rider_id, target_id, summary FROM fleet_schema.admin_audit"
            + where + " ORDER BY at DESC, id DESC LIMIT " + (AUDIT_PAGE + 1),
            (row, n) -> new AuditEntry(row.getObject("id", UUID.class), instant(row, "at"), row.getString("actor_name"),
                row.getString("action"), row.getObject("rider_id", UUID.class), row.getString("target_id"), row.getString("summary")),
            args.toArray());
        String next = null;
        if (entries.size() > AUDIT_PAGE) {
            entries = entries.subList(0, AUDIT_PAGE);
            next = new Cursor(entries.get(AUDIT_PAGE - 1).at(), entries.get(AUDIT_PAGE - 1).entryId()).encode();
        }
        return new AuditPage(entries, next);
    }

    /** Records a read or an action without an Idempotency-Key. */
    public void audit(Admin admin, String action, UUID riderId, String targetId, String summary) {
        audit(admin, action, riderId, targetId, summary, null, null, null);
    }

    private Object once(Admin admin, UUID key, String action, String request, Supplier<Done> work) {
        String hash = sha256(action + "\n" + request);
        List<Map<String, Object>> previous = jdbc.queryForList("SELECT request_hash, response_body FROM fleet_schema.admin_audit "
            + "WHERE actor_id = ? AND idem_key = ?", admin.id(), key);
        if (!previous.isEmpty()) {
            if (!hash.equals(previous.get(0).get("request_hash"))) {
                throw reused();
            }
            try {
                return json.readTree((String) previous.get(0).get("response_body"));
            } catch (JsonProcessingException exception) {
                throw new IllegalStateException("Stored fleet admin response is unreadable", exception);
            }
        }
        Done done = work.get();
        try {
            audit(admin, action, done.riderId(), done.targetId(), done.summary(), key, hash, json.writeValueAsString(done.body()));
        } catch (DuplicateKeyException exception) {
            throw reused(); // the same key was saved by a parallel request; this one rolls back
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Fleet admin response could not be stored", exception);
        }
        return done.body();
    }

    private void audit(Admin admin, String action, UUID riderId, String targetId, String summary, UUID key, String hash, String body) {
        jdbc.update("INSERT INTO fleet_schema.admin_audit (id, actor_id, actor_name, action, rider_id, target_id, summary, idem_key, "
            + "request_hash, response_body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", UUID.randomUUID(), admin.id(), admin.name(), action,
            riderId, targetId, summary.length() > 1000 ? summary.substring(0, 1000) : summary, key, hash, body);
    }

    private Instant openNoticeDeadline(UUID riderId) {
        return jdbc.query(FleetRules.OPEN_NOTICE_SQL, (row, n) -> instant(row, "deadline"), riderId).stream().findFirst()
            .orElse(null);
    }

    private LockedRider lockRider(UUID riderId) {
        return jdbc.query("SELECT name, status, identity_id FROM fleet_schema.rider WHERE id = ? FOR UPDATE",
            (row, n) -> new LockedRider(row.getString("name"), row.getString("status"), row.getObject("identity_id", UUID.class)), riderId)
            .stream().findFirst().orElseThrow(FleetAdminService::riderNotFound);
    }

    private RiderHeader header(UUID riderId) {
        return jdbc.query(SUMMARY + " WHERE r.id = ?", (row, n) -> {
            RiderSummary summary = summary(row);
            String vehicle = row.getString("vehicle_reg_number");
            return new RiderHeader(summary.riderId(), summary.name(), summary.phoneMasked(), summary.status(), summary.pendingDocuments(),
                summary.pendingDevice(), summary.createdAt(), summary.name(), row.getString("language"),
                vehicle == null ? null : FleetRules.maskVehicle(vehicle));
        }, riderId).stream().findFirst().orElseThrow(FleetAdminService::riderNotFound);
    }

    private RiderDocument reviewedDocument(int updated, UUID riderId, UUID documentId) {
        RiderDocument document = jdbc.query(DOCUMENT + "WHERE id = ? AND rider_id = ?", (row, n) -> document(row), documentId, riderId)
            .stream().findFirst().orElseThrow(() -> FleetApiException.notFound("DOCUMENT_NOT_FOUND", "No such document for this rider."));
        if (updated == 0) {
            throw FleetApiException.conflict("DOCUMENT_NOT_PENDING", "This document was already reviewed.");
        }
        return document;
    }

    private static RiderSummary summary(ResultSet row) throws SQLException {
        return new RiderSummary(row.getObject("id", UUID.class), row.getString("name"), FleetRules.maskPhone(row.getString("phone")),
            row.getString("status"), row.getInt("pending_documents"), row.getBoolean("pending_device"), instant(row, "created_at"));
    }

    private static RiderDocument document(ResultSet row) throws SQLException {
        return new RiderDocument(row.getObject("id", UUID.class), row.getString("type"), row.getString("status"),
            row.getObject("expires_on", LocalDate.class), row.getString("reason"), row.getString("reviewed_by_name"),
            instant(row, "reviewed_at"), instant(row, "uploaded_at"));
    }

    private static RiderDevice device(ResultSet row) throws SQLException {
        return new RiderDevice(row.getObject("id", UUID.class), row.getString("model"), row.getString("app_version"), row.getString("state"),
            instant(row, "first_seen_at"), row.getString("approved_by_name"), instant(row, "approved_at"));
    }

    private static PayoutAccount payoutAccount(ResultSet row) throws SQLException {
        return new PayoutAccount(row.getString("method"), row.getString("masked_account"), row.getString("ifsc"),
            row.getString("holder_name"), row.getString("set_by_name"), instant(row, "set_at"));
    }

    private static StatusEvent statusEvent(ResultSet row) throws SQLException {
        return new StatusEvent(row.getObject("id", UUID.class), row.getString("kind"), row.getString("reason"),
            row.getString("evidence_summary"), instant(row, "deadline"), instant(row, "review_by"), row.getString("appeal_phone"),
            row.getString("approver_name"), instant(row, "created_at"), row.getString("status_after"));
    }

    private static SelfieReview selfie(ResultSet row) throws SQLException {
        return new SelfieReview(row.getObject("id", UUID.class), row.getObject("rider_id", UUID.class), row.getString("name"),
            instant(row, "started_at"), row.getString("selfie_state"), row.getString("selfie_reason"),
            row.getString("selfie_reviewed_by_name"), instant(row, "selfie_reviewed_at"));
    }

    static Instant instant(ResultSet row, String column) throws SQLException {
        Timestamp value = row.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    private static String reason(String reason) {
        String text = reason == null ? "" : reason.trim();
        if (text.length() < 3 || text.length() > 1000) {
            throw FleetApiException.invalid("Write a reason of 3 to 1,000 characters.");
        }
        return text;
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw FleetApiException.invalid("Check the details and try again.");
        }
    }

    private static String sha256(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static FleetApiException riderNotFound() {
        return FleetApiException.notFound("RIDER_NOT_FOUND", "No such rider.");
    }

    private static FleetApiException notUnique() {
        return FleetApiException.conflict("PAYOUT_ACCOUNT_NOT_UNIQUE", "This UPI ID or bank account belongs to another rider.");
    }

    private static FleetApiException reused() {
        return FleetApiException.conflict("IDEMPOTENCY_KEY_REUSED", "This action was already sent with different details. Reload the page.");
    }

    private record Done(Object body, UUID riderId, String targetId, String summary) {
    }

    private record LockedRider(String name, String status, UUID identityId) {
    }

    /** Opaque page cursor: the last row's time and id. */
    record Cursor(Instant at, UUID id) {
        String encode() {
            return Base64.getUrlEncoder().withoutPadding().encodeToString((at + "|" + id).getBytes(StandardCharsets.UTF_8));
        }

        static Cursor parse(String value) {
            if (value == null || value.isBlank()) {
                return null;
            }
            try {
                String[] parts = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8).split("\\|", 2);
                return new Cursor(Instant.parse(parts[0]), UUID.fromString(parts[1]));
            } catch (RuntimeException exception) {
                throw FleetApiException.invalid("This page link is not valid. Start again from the first page.");
            }
        }
    }
}
