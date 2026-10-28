package in.craves.integration.fleet.rider;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetPolicyStore.DispatchRules;
import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.FleetPolicyStore.TermsChange;
import in.craves.integration.fleet.FleetProperties;
import in.craves.integration.fleet.FleetRules;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.money.FleetEarnings;
import in.craves.integration.fleet.rider.FleetRiderModels.Banner;
import in.craves.integration.fleet.rider.FleetRiderModels.Features;
import in.craves.integration.fleet.rider.FleetRiderModels.HomeSummary;
import in.craves.integration.fleet.rider.FleetRiderModels.Insurance;
import in.craves.integration.fleet.rider.FleetRiderModels.LabelValue;
import in.craves.integration.fleet.rider.FleetRiderModels.NextSlot;
import in.craves.integration.fleet.rider.FleetRiderModels.OfferRules;
import in.craves.integration.fleet.rider.FleetRiderModels.PrivacyNotice;
import in.craves.integration.fleet.rider.FleetRiderModels.ProfileDocument;
import in.craves.integration.fleet.rider.FleetRiderModels.RestPoint;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderMe;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderNotice;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderProfile;
import in.craves.integration.fleet.rider.FleetRiderModels.Terms;
import in.craves.integration.fleet.rider.FleetRiderModels.UpcomingTerms;
import in.craves.integration.fleet.rider.FleetRiderModels.Vehicle;
import in.craves.integration.security.CravesPrincipal;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

/** The rider API (contracts/openapi/rider-v1.yaml). Off unless CRAVES_FLEET_RIDER_API_ENABLED. */
@Service
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled"}, havingValue = "true")
public class FleetRiderService {
    static final int MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
    // Rider app document codes and the stored types the ops console reviews. Aadhaar is never one of them.
    static final Map<String, String> DOCUMENT_TYPES = Map.of("DL", "DRIVING_LICENCE", "RC", "VEHICLE_RC", "INSURANCE",
        "VEHICLE_INSURANCE", "PUC", "PUC", "PAN", "PAN", "BANK", "BANK_PROOF");
    private static final Map<String, String> DOCUMENT_CODES = DOCUMENT_TYPES.entrySet().stream()
        .collect(Collectors.toMap(Map.Entry::getValue, Map.Entry::getKey));
    private static final List<String> DOCUMENT_ORDER = List.of("DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PUC", "PAN",
        "BANK_PROOF", "PHOTO", "ADDRESS_PROOF");
    static final Map<String, String> DOCUMENT_LABELS = Map.of("DRIVING_LICENCE", "Driving licence", "VEHICLE_RC", "Vehicle RC",
        "VEHICLE_INSURANCE", "Vehicle insurance", "PUC", "PUC certificate", "PAN", "PAN card", "BANK_PROOF", "Bank proof",
        "PHOTO", "Photo", "ADDRESS_PROOF", "Address proof");
    private static final Set<String> DOCUMENT_CONTENT_TYPES = Set.of("image/jpeg", "image/png", "application/pdf");
    // What a rider still signing up must send, by what they ride (V160); NULL is a rider ops added before sign-up existed.
    static final Map<String, List<String>> REQUIRED_DOCUMENTS = Map.of(
        "PETROL", List.of("DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PUC", "PAN", "BANK_PROOF"),
        "ELECTRIC", List.of("DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PAN", "BANK_PROOF"),
        "BICYCLE", List.of("PAN", "BANK_PROOF"));
    private static final Features NO_FEATURES = new Features(false, false, false);
    private static final Set<String> LANGUAGES = Set.of("en", "te", "hi");

    private final JdbcTemplate jdbc;
    private final FleetPolicyStore policies;
    private final FleetProperties properties;
    private final FleetStorage storage;

    public FleetRiderService(JdbcTemplate jdbc, FleetPolicyStore policies, FleetProperties properties, FleetStorage storage) {
        this.jdbc = jdbc;
        this.policies = policies;
        this.properties = properties;
        this.storage = storage;
    }

    /**
     * Works for any signed-in user. The first call from an identity whose OTP-verified phone (the JWT phone_number)
     * matches a rider ops created links that rider to the identity; anyone else is NOT_RIDER.
     */
    @Transactional
    public RiderMe me(CravesPrincipal principal) {
        UUID identity = principal.identityId();
        String phone = principal.phoneNumber();
        if (phone != null && phone.matches("^\\+91[6-9][0-9]{9}$")) {
            jdbc.update("UPDATE fleet_schema.rider SET identity_id = ?, updated_at = now() WHERE phone = ? AND identity_id IS NULL "
                + "AND NOT EXISTS (SELECT 1 FROM fleet_schema.rider WHERE identity_id = ?)", identity, phone, identity);
        }
        String termsVersion = policies.currentRateCard().map(RateCard::version).orElse("");
        String support = properties.supportPhone() == null ? "" : properties.supportPhone();
        String whatsapp = StringUtils.hasText(properties.supportWhatsappUrl()) ? properties.supportWhatsappUrl() : null;
        List<Rider> found = jdbc.query("SELECT id, name, phone, language, status, min_app_version, vehicle_label, vehicle_reg_number "
            + "FROM fleet_schema.rider WHERE identity_id = ?", (row, n) -> rider(row), identity);
        if (found.isEmpty()) {
            return new RiderMe("", "", FleetRules.maskPhone(phone), null, "NOT_RIDER", null, null, null, termsVersion, null, "en",
                properties.minAppVersion(), support, whatsapp, NO_FEATURES, null);
        }
        Rider rider = found.get(0);
        String statusReason = null;
        Instant statusEffectiveAt = null;
        RiderNotice notice = null;
        if ("SUSPENDED".equals(rider.status()) || "DEACTIVATED".equals(rider.status())) {
            List<StatusChange> last = jdbc.query("SELECT reason, evidence_summary, review_by AS deadline, appeal_phone, created_at "
                + "FROM fleet_schema.rider_status_event WHERE rider_id = ? AND status_after <> status_before ORDER BY created_at DESC LIMIT 1",
                (row, n) -> statusChange(row), rider.id());
            if (!last.isEmpty()) {
                StatusChange change = last.get(0);
                statusReason = change.reason();
                statusEffectiveAt = change.at();
                notice = "SUSPENDED".equals(rider.status())
                    ? new RiderNotice("Paused for a safety review", change.reason(), change.deadline(), change.appealPhone(), change.at(),
                        change.evidence(), null)
                    : new RiderNotice("Your rider account is closed", change.reason(), null, change.appealPhone(), change.at(),
                        change.evidence(), null);
            }
        }
        if (notice == null) {
            notice = jdbc.query(FleetRules.OPEN_NOTICE_SQL, (row, n) -> statusChange(row), rider.id()).stream().findFirst()
                .map(open -> new RiderNotice("Notice: we are checking a problem", open.reason(), open.deadline(), open.appealPhone(),
                    open.at(), open.evidence(), null))
                .orElse(null);
        }
        String accepted = jdbc.queryForList("SELECT version FROM fleet_schema.rider_terms_acceptance WHERE rider_id = ? "
            + "ORDER BY (version = ?) DESC, accepted_at DESC LIMIT 1", String.class, rider.id(), termsVersion).stream().findFirst().orElse(null);
        return new RiderMe(rider.id().toString(), rider.name(), FleetRules.maskPhone(rider.phone()), null, rider.status(), statusReason,
            statusEffectiveAt, notice, termsVersion, accepted, rider.language(),
            rider.minAppVersion() != null ? rider.minAppVersion() : properties.minAppVersion(), support, whatsapp, features(rider.id()),
            privacyNotice(rider.id()));
    }

    /** The privacy notice in force and whether this rider accepted it; null while CRAVES_FLEET_PRIVACY_NOTICE_* are unset (P2-09). */
    PrivacyNotice privacyNotice(UUID riderId) {
        if (!StringUtils.hasText(properties.privacyNoticeVersion()) || !StringUtils.hasText(properties.privacyNoticeUrl())) {
            return null;
        }
        String version = properties.privacyNoticeVersion().trim();
        boolean accepted = !jdbc.queryForList("SELECT 1 FROM fleet_schema.rider_privacy_acceptance WHERE rider_id = ? AND version = ?",
            Integer.class, riderId, version).isEmpty();
        return new PrivacyNotice(version, properties.privacyNoticeUrl().trim(), accepted);
    }

    /** Only the version in force can be accepted; anything else means the notice changed while the rider read it. */
    @Transactional
    public void acceptPrivacyNotice(UUID identityId, String version, String language) {
        Rider rider = rider(identityId);
        PrivacyNotice notice = privacyNotice(rider.id());
        if (notice == null || !notice.version().equals(version)) {
            throw FleetApiException.conflict("NOTICE_CHANGED", "The privacy notice changed. Please read the new one.");
        }
        jdbc.update("INSERT INTO fleet_schema.rider_privacy_acceptance (rider_id, version, language) VALUES (?, ?, ?) "
            + "ON CONFLICT (rider_id, version) DO NOTHING", rider.id(), version, language != null && LANGUAGES.contains(language) ? language : rider.language());
    }

    /**
     * Payouts and withdrawals show once the rider has a payout account ops set or confirmed (ACTIVE), and no failed payout
     * paused it. The native outbox is on exactly when trip steps take the shift credential (P2-01).
     */
    private Features features(UUID riderId) {
        boolean verified = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_payout_account "
            + "WHERE rider_id = ? AND state = 'ACTIVE' AND payouts_paused_at IS NULL)", Boolean.class, riderId));
        return new Features(verified, verified, properties.tripShiftCredentialEnabled());
    }

    /** Any rider ops added, before activation too (no RIDER role yet), so they can see what ops is still checking. */
    @Transactional(readOnly = true)
    public RiderProfile profile(UUID identityId) {
        Rider rider = rider(identityId);
        List<Latest> sent = new ArrayList<>(jdbc.query("SELECT DISTINCT ON (type) type, " + FleetRules.DOCUMENT_STATUS_SQL + " AS status, "
                + "expires_on, reason FROM fleet_schema.rider_document WHERE rider_id = ? ORDER BY type, uploaded_at DESC",
            (row, n) -> {
                String type = row.getString("type");
                String status = row.getString("status");
                return new Latest(type, new ProfileDocument(DOCUMENT_CODES.get(type), DOCUMENT_LABELS.get(type), status,
                    row.getObject("expires_on", LocalDate.class), "REJECTED".equals(status) ? row.getString("reason") : null));
            }, rider.id()));
        String kind = jdbc.queryForObject("SELECT vehicle_kind FROM fleet_schema.rider WHERE id = ?", String.class, rider.id());
        if ("PENDING".equals(rider.status())) {
            // A rider still signing up sees every document they must send, sent or not (MISSING), like the chef checklist.
            Set<String> have = sent.stream().map(Latest::type).collect(Collectors.toSet());
            REQUIRED_DOCUMENTS.get(kind == null ? "PETROL" : kind).stream().filter(type -> !have.contains(type))
                .forEach(type -> sent.add(new Latest(type, new ProfileDocument(DOCUMENT_CODES.get(type), DOCUMENT_LABELS.get(type),
                    "MISSING", null, null))));
        }
        List<ProfileDocument> documents = sent.stream().sorted(Comparator.comparingInt(latest -> DOCUMENT_ORDER.indexOf(latest.type())))
            .map(Latest::document).toList();
        String payoutAccount = jdbc.queryForList("SELECT masked_account FROM fleet_schema.rider_payout_account WHERE rider_id = ? "
            + "AND state = 'ACTIVE'", String.class, rider.id()).stream().findFirst().orElse(null);
        String submitted = jdbc.queryForList("SELECT masked_account FROM fleet_schema.rider_payout_account WHERE rider_id = ? "
            + "AND state = 'SUBMITTED'", String.class, rider.id()).stream().findFirst().orElse(null);
        Insurance insurance = StringUtils.hasText(properties.insuranceLabel())
            ? new Insurance(properties.insuranceLabel(), properties.supportPhone() == null ? "" : properties.supportPhone(), null) : null;
        return new RiderProfile(new Vehicle(rider.vehicleLabel(),
            rider.vehicleRegNumber() == null ? null : FleetRules.maskVehicle(rider.vehicleRegNumber()), kind), documents, payoutAccount,
            insurance, submitted);
    }

    /**
     * The shift (online while an open shift's credential still works), the trip in progress, the running or next booked
     * slot with its own hourly guarantee (zoneName and slotEndsAt only while one runs), rest point and banner, and today's
     * pay (net of TDS) and trips from rider_earning.
     */
    @Transactional(readOnly = true)
    public HomeSummary home(UUID identityId) {
        Rider rider = rider(identityId);
        List<Map<String, Object>> slots = jdbc.queryForList("SELECT zone_name, starts_at, ends_at, rest_point_name, rest_point_area, "
            + "guaranteed_per_hour_paise, starts_at <= now() AS running FROM fleet_schema.rider_slot WHERE rider_id = ? "
            + "AND status = 'BOOKED' AND ends_at > now() ORDER BY starts_at LIMIT 1", rider.id());
        NextSlot next = null;
        RestPoint restPoint = null;
        Long guaranteed = null;
        String zoneName = null;
        Instant slotEndsAt = null;
        if (!slots.isEmpty()) {
            Map<String, Object> slot = slots.get(0);
            next = new NextSlot(((Timestamp) slot.get("starts_at")).toInstant(), ((Timestamp) slot.get("ends_at")).toInstant(),
                (String) slot.get("zone_name"));
            if (slot.get("rest_point_name") != null) {
                restPoint = new RestPoint((String) slot.get("rest_point_name"), (String) slot.get("rest_point_area"));
            }
            guaranteed = slot.get("guaranteed_per_hour_paise") == null ? null : ((Number) slot.get("guaranteed_per_hour_paise")).longValue();
            if (Boolean.TRUE.equals(slot.get("running"))) {
                zoneName = next.zoneName();
                slotEndsAt = next.endsAt();
            }
        }
        Banner banner = jdbc.query("SELECT tone, text FROM fleet_schema.ops_banner WHERE starts_at <= now() AND ends_at > now() "
            + "ORDER BY starts_at DESC LIMIT 1", (row, n) -> new Banner(row.getString("tone"), row.getString("text")))
            .stream().findFirst().orElse(null);
        Instant shiftStartedAt = jdbc.queryForList("SELECT started_at FROM fleet_schema.rider_shift WHERE rider_id = ? AND ended_at IS NULL "
            + "AND credential_revoked_at IS NULL AND credential_expires_at > now()", Timestamp.class, rider.id()).stream().findFirst()
            .map(Timestamp::toInstant).orElse(null);
        String activeTripId = jdbc.queryForList("SELECT id::text FROM fleet_schema.trip WHERE rider_id = ? "
            + "AND state IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP')", String.class, rider.id()).stream().findFirst().orElse(null);
        FleetEarnings.Window today = FleetEarnings.window("today", Instant.now());
        long[] earned = jdbc.queryForObject(FleetEarnings.RANGE_TOTAL_SQL, (row, n) -> new long[] {row.getLong("paise"), row.getLong("trips")},
            rider.id(), Timestamp.from(today.from()), Timestamp.from(today.to()));
        return new HomeSummary(shiftStartedAt != null, shiftStartedAt, zoneName, slotEndsAt, earned[0], (int) earned[1], activeTripId, next,
            guaranteed, restPoint, banner);
    }

    /** A new photo of one document, from any rider ops added (before activation too); PENDING until ops reviews it by hand. */
    @Transactional
    public void uploadDocument(UUID identityId, String type, MultipartFile photo) {
        Rider rider = rider(identityId);
        String stored = type == null ? null : DOCUMENT_TYPES.get(type);
        if (stored == null) {
            throw FleetApiException.unprocessable("DOCUMENT_TYPE_NOT_ALLOWED", "Choose DL, RC, INSURANCE, PUC, PAN or BANK. "
                + "Craves never collects Aadhaar.");
        }
        byte[] bytes = documentBytes(photo);
        UUID id = UUID.randomUUID();
        String extension = switch (photo.getContentType()) {
            case "image/png" -> ".png";
            case "application/pdf" -> ".pdf";
            default -> ".jpg";
        };
        String blob = "riders/" + rider.id() + "/documents/" + stored.toLowerCase(Locale.ROOT) + "/" + id + extension;
        // shortcut: a failed insert after the upload leaves an unreferenced file; add a sweep if that ever shows up.
        storage.upload(blob, bytes, photo.getContentType(), false);
        jdbc.update("INSERT INTO fleet_schema.rider_document (id, rider_id, type, blob_name, content_type, size_bytes) "
            + "VALUES (?, ?, ?, ?, ?, ?)", id, rider.id(), stored, blob, photo.getContentType(), bytes.length);
    }

    @Transactional(readOnly = true)
    public Terms terms(UUID identityId) {
        String language = rider(identityId).language();
        TermsChange change = policies.nextTermsChange().orElse(null);
        return terms(currentRateCard(), policies.pickupDetour(null), change, language, properties.supportPhone(), offerRules(null),
            change == null ? null : offerRules(change.at()));
    }

    /** How orders are offered as riders are shown at that time (null: now); null when there is no dispatch policy at all. */
    private OfferRules offerRules(Instant at) {
        return policies.shownDispatchPolicy(at, "").map(policy -> new OfferRules(((Number) policy.get("offers_at_once")).intValue(),
            ((Number) policy.get("offer_rounds")).intValue(), ((Number) policy.get("offer_seconds")).intValue(),
            ((Number) policy.get("radius_m")).intValue(), ((Number) policy.get("fair_band_m")).intValue())).orElse(null);
    }

    /** Only the version in force can be accepted; anything else means the terms changed while the rider read them. */
    @Transactional
    public void acceptTerms(UUID identityId, String version) {
        Rider rider = rider(identityId);
        if (version == null || !version.equals(currentRateCard().version())) {
            throw FleetApiException.conflict("TERMS_CHANGED", "The terms changed. Please read the new version.");
        }
        jdbc.update("INSERT INTO fleet_schema.rider_terms_acceptance (rider_id, version, language) VALUES (?, ?, ?) "
            + "ON CONFLICT (rider_id, version) DO NOTHING", rider.id(), version, rider.language());
    }

    /** The id of the rider linked to this signed-in identity; 403 NOT_A_RIDER otherwise. */
    public UUID riderId(UUID identityId) {
        return rider(identityId).id();
    }

    /** The rider linked to this signed-in identity. */
    Rider rider(UUID identityId) {
        return jdbc.query("SELECT id, name, phone, language, status, min_app_version, vehicle_label, vehicle_reg_number "
                + "FROM fleet_schema.rider WHERE identity_id = ?", (row, n) -> rider(row), identityId)
            .stream().findFirst().orElseThrow(() -> new FleetApiException(403, "NOT_A_RIDER", "This account is not a Craves rider."));
    }

    RateCard currentRateCard() {
        return policies.currentRateCard()
            .orElseThrow(() -> new FleetApiException(503, "TERMS_UNAVAILABLE", "The terms are not available yet. Call rider support."));
    }

    /**
     * Rate card lines come from the stored values and the pickup detour in force, so the terms always show what pay uses.
     * The summary of changes is stored per language; te and hi fall back to English, and the labels stay English until
     * they are translated. change, when not null, is the next change riders get 14 days' notice of, shown the same way.
     */
    static Terms terms(RateCard card, Integer detour, TermsChange change, String language, String supportPhone) {
        return terms(card, detour, change, language, supportPhone, null, null);
    }

    /** offerRules and upcomingRules: how orders are offered now and after the change (Phase 4); null without a policy. */
    static Terms terms(RateCard card, Integer detour, TermsChange change, String language, String supportPhone, OfferRules offerRules,
                       OfferRules upcomingRules) {
        List<LabelValue> grievance = List.of(
            new LabelValue("Craves rider support, every slot", supportPhone == null ? "" : supportPhone),
            new LabelValue("Telangana Grievance Redressal Officer", "Link added when the state portal opens"));
        return new Terms(card.version(), card.effectiveFrom(), summary(card, language), rateCardLines(card, detour), grievance,
            card.fullTextUrl(), card.draft(), change == null ? null : upcoming(change, language, upcomingRules), offerRules);
    }

    /**
     * The terms riders will have then: the card's summary if it starts then, a line when the pickup detour changes, and one
     * when how orders are offered changes (the app words the rules in the rider's language; this line is English).
     */
    private static UpcomingTerms upcoming(TermsChange change, String language, OfferRules upcomingRules) {
        List<String> summary = new ArrayList<>(change.cardStarts() ? summary(change.card(), language) : List.of());
        if (!Objects.equals(change.detourBefore(), change.detourAfter())) {
            summary.add("Pickup distance changes from straight line × " + factor(change.detourBefore()) + " to × "
                + factor(change.detourAfter()) + ".");
        }
        if (!Objects.equals(change.rulesBefore(), change.rulesAfter())) {
            summary.add("How orders are offered changes: " + offerRulesLine(change.rulesAfter()));
        }
        return new UpcomingTerms(change.card().version(), change.at(), summary, rateCardLines(change.card(), change.detourAfter()),
            upcomingRules);
    }

    /** How orders are offered, in one English line. */
    static String offerRulesLine(DispatchRules rules) {
        int n = rules.offersAtOnce();
        String who = rules.fairBandM() > 0
            ? "Among the free riders within " + km(rules.fairBandM()) + " km of the nearest, " + (n == 1 ? "the one who has" : "the " + n
                + " who have") + " earned the least per online hour today"
            : n == 1 ? "The nearest free rider" : "The " + n + " nearest free riders";
        return who + (n == 1 ? " hears first, one rider at a time" : " hear at once, and the first to accept gets it")
            + (rules.offerRounds() > 1 ? ", in up to " + rules.offerRounds() + " rounds" : "") + ". Declining is free.";
    }

    private static List<String> summary(RateCard card, String language) {
        return card.summaryOfChanges().getOrDefault(language, card.summaryOfChanges().getOrDefault("en", List.of()));
    }

    private static List<LabelValue> rateCardLines(RateCard card, Integer detour) {
        String baseKm = km(card.baseDropM());
        List<LabelValue> lines = new ArrayList<>(List.of(
            new LabelValue("Base pay, first " + baseKm + " km of the drop", rupees(card.basePaise())),
            new LabelValue("Each drop km after " + baseKm + " km", rupees(card.dropPerKmPaise())),
            new LabelValue(card.pickupFreeM() > 0 ? "Ride to the kitchen, each km after the first " + km(card.pickupFreeM()) + " km"
                : "Ride to the kitchen, each km", rupees(card.pickupPerKmPaise()))));
        if (detour != null) {
            lines.add(new LabelValue("Pickup distance", "straight line × " + factor(detour)));
        }
        lines.addAll(List.of(
            new LabelValue("Waiting at the kitchen, after " + card.waitFreeMinutes() + " free minutes",
                rupees(card.waitPerMinutePaise()) + " a minute"),
            new LabelValue("Order cancelled after you reach the kitchen", rupees(card.cancellationFeePaise())
                + " plus the ride to the kitchen"),
            new LabelValue("Order cancelled after pickup: return to the kitchen, each km", rupees(card.returnPerKmPaise())),
            new LabelValue("Customer not answering: full pay after two calls and a wait of",
                card.unreachableWaitMinutes() + " minutes"),
            new LabelValue("Guaranteed minimum in a booked slot", rupees(card.slotGuaranteePerHourPaise()) + " an hour"),
            new LabelValue("Declining or missing an offer", "Free")));
        return lines;
    }

    /** 130 percent is "1.3". */
    static String factor(int percent) {
        return BigDecimal.valueOf(percent, 2).stripTrailingZeros().toPlainString();
    }

    /** 4000 is "₹40"; 150 is "₹1.50". */
    public static String rupees(long paise) {
        return paise % 100 == 0 ? "₹" + paise / 100 : "₹" + BigDecimal.valueOf(paise, 2).toPlainString();
    }

    /** 2000 is "2"; 1500 is "1.5". */
    static String km(int metres) {
        return BigDecimal.valueOf(metres, 3).stripTrailingZeros().toPlainString();
    }

    private static byte[] documentBytes(MultipartFile photo) {
        if (photo == null || photo.isEmpty() || photo.getSize() > MAX_DOCUMENT_BYTES
            || !DOCUMENT_CONTENT_TYPES.contains(photo.getContentType())) {
            throw invalidFile();
        }
        try (InputStream input = photo.getInputStream()) {
            byte[] bytes = input.readNBytes(MAX_DOCUMENT_BYTES + 1);
            if (bytes.length != photo.getSize() || !FleetStorage.signatureMatches(photo.getContentType(), bytes)) {
                throw invalidFile();
            }
            return bytes;
        } catch (IOException exception) {
            throw invalidFile();
        }
    }

    private static FleetApiException invalidFile() {
        return FleetApiException.unprocessable("DOCUMENT_FILE_INVALID", "Send a clear JPG, PNG or PDF of the document, under 10 MB.");
    }

    private static Rider rider(ResultSet row) throws SQLException {
        return new Rider(row.getObject("id", UUID.class), row.getString("name"), row.getString("phone"), row.getString("language"),
            row.getString("status"), row.getString("min_app_version"), row.getString("vehicle_label"), row.getString("vehicle_reg_number"));
    }

    private static StatusChange statusChange(ResultSet row) throws SQLException {
        Timestamp deadline = row.getTimestamp("deadline");
        return new StatusChange(row.getString("reason"), row.getString("evidence_summary"), deadline == null ? null : deadline.toInstant(),
            row.getString("appeal_phone"), row.getTimestamp("created_at").toInstant());
    }

    record Rider(UUID id, String name, String phone, String language, String status, String minAppVersion, String vehicleLabel,
                 String vehicleRegNumber) {
    }

    private record Latest(String type, ProfileDocument document) {
    }

    private record StatusChange(String reason, String evidence, Instant deadline, String appealPhone, Instant at) {
    }
}
