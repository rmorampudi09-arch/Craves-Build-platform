package in.craves.integration.fleet.admin;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetProperties;
import in.craves.integration.fleet.FleetRules;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminModels.ApplicationDecision;
import in.craves.integration.fleet.admin.FleetAdminModels.ApplicationResult;
import in.craves.integration.fleet.admin.FleetAdminModels.DocumentVerdict;
import in.craves.integration.fleet.admin.FleetAdminModels.PayoutAccount;
import in.craves.integration.fleet.admin.FleetAdminService.Done;
import in.craves.integration.fleet.rider.FleetRiderService;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ops's one decision on a rider's application (docs/riders/FLOWS.md). The review page sends a verdict on each document and
 * on the payout account, and all of it applies in one transaction with one audit row. APPROVE needs nothing to fix and a
 * complete application: it verifies the documents, confirms the payout account, puts the rider on the pilot riders while
 * test mode is on, and activates them (a RESTORE event, the RIDER role last). FIXES verifies what was fine and asks the
 * rider for new photos, or the payout account again, with the reasons they read.
 */
@Service
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetApplicationService {
    private static final Set<String> DECISIONS = Set.of("APPROVE", "FIXES");
    private static final Set<String> PAYOUT_ACTIONS = Set.of("CONFIRM", "RETURN");
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    // The latest photo of each type: what the rider's checklist and the review page show.
    private static final String LATEST = "SELECT DISTINCT ON (type) id, type, " + FleetRules.DOCUMENT_STATUS_SQL + " AS status "
        + "FROM fleet_schema.rider_document WHERE rider_id = ? ORDER BY type, uploaded_at DESC";
    /**
     * What the rider can change while ops checks the application, besides photos (each verdict names its photo): the details
     * and the payout account they sent. The review page sends this back, so a decision applies only to what ops saw.
     */
    static final String VERSION = "SELECT md5(json_build_array(r.name, r.vehicle_kind, r.vehicle_label, r.vehicle_reg_number, "
        + "(SELECT string_agg(a.id::text, ',' ORDER BY a.id) FROM fleet_schema.rider_payout_account a "
        + "WHERE a.rider_id = r.id AND a.state = 'SUBMITTED'))::text) FROM fleet_schema.rider r WHERE r.id = ?";
    private static final Pattern MD5 = Pattern.compile("[0-9a-f]{32}");

    private final JdbcTemplate jdbc;
    private final FleetAdminService admin;
    private final FleetPolicyStore policies;
    private final FleetProperties properties;

    public FleetApplicationService(JdbcTemplate jdbc, FleetAdminService admin, FleetPolicyStore policies, FleetProperties properties) {
        this.jdbc = jdbc;
        this.admin = admin;
        this.policies = policies;
        this.properties = properties;
    }

    /**
     * Applies the decision once per admin and Idempotency-Key (a replay answers the first result). paymentsAdmin: the
     * caller may confirm a payout account, as POST payout-account/confirm needs.
     */
    @Transactional
    public Object decide(Admin by, boolean paymentsAdmin, UUID key, UUID riderId, ApplicationDecision input) {
        List<DocumentVerdict> verdicts = check(input);
        if ("CONFIRM".equals(input.payoutAccount()) && !paymentsAdmin) {
            throw new FleetApiException(403, "PAYMENTS_ADMIN_REQUIRED",
                "Only a platform admin, or an operations admin who is also a payments admin, can confirm a payout account. Ask one to "
                    + "approve. To send fixes now, leave the payout account unmarked.");
        }
        boolean approve = "APPROVE".equals(input.decision());
        return admin.once(by, key, approve ? "APPLICATION_APPROVED" : "APPLICATION_FIXES_ASKED", riderId + "\n" + admin.write(input),
            () -> apply(by, riderId, approve, verdicts, input.payoutAccount(), input.applicationVersion()));
    }

    private static List<DocumentVerdict> check(ApplicationDecision input) {
        if (input == null || !DECISIONS.contains(input.decision())) {
            throw FleetApiException.invalid("Choose APPROVE or FIXES.");
        }
        if (input.applicationVersion() == null || !MD5.matcher(input.applicationVersion()).matches()) {
            throw FleetApiException.invalid("Send the applicationVersion of the rider's details you checked.");
        }
        if (input.payoutAccount() != null && !PAYOUT_ACTIONS.contains(input.payoutAccount())) {
            throw FleetApiException.invalid("For the payout account, choose CONFIRM or RETURN.");
        }
        List<DocumentVerdict> verdicts = input.documents() == null ? List.of() : input.documents();
        if (verdicts.size() > 20) {
            throw FleetApiException.invalid("Send at most 20 document verdicts.");
        }
        Set<UUID> seen = new HashSet<>();
        LocalDate today = LocalDate.now(IST);
        for (DocumentVerdict verdict : verdicts) {
            if (verdict == null || verdict.documentId() == null || !seen.add(verdict.documentId())) {
                throw FleetApiException.invalid("Send one verdict for each document.");
            }
            if ("FIX".equals(verdict.verdict())) {
                FleetAdminService.reason(verdict.reason());
            } else if (!"OK".equals(verdict.verdict())) {
                throw FleetApiException.invalid("Mark each document OK or FIX.");
            } else if (verdict.expiresOn() != null && verdict.expiresOn().isBefore(today)) {
                throw FleetApiException.unprocessable("DOCUMENT_EXPIRED", "A document marked OK has already expired. Ask the rider for a new one.");
            }
        }
        boolean fixes = verdicts.stream().anyMatch(verdict -> "FIX".equals(verdict.verdict())) || "RETURN".equals(input.payoutAccount());
        if ("APPROVE".equals(input.decision()) && fixes) {
            throw FleetApiException.unprocessable("FIXES_IN_APPROVAL", "Something is marked to fix. Ask for fixes instead, or mark it OK.");
        }
        if ("FIXES".equals(input.decision()) && !fixes) {
            throw FleetApiException.unprocessable("NO_FIXES", "Mark what the rider must fix, with a reason.");
        }
        return verdicts;
    }

    private Done apply(Admin by, UUID riderId, boolean approve, List<DocumentVerdict> verdicts, String payout, String version) {
        Map<String, Object> rider = jdbc.queryForList("SELECT status, vehicle_kind FROM fleet_schema.rider WHERE id = ? FOR UPDATE", riderId)
            .stream().findFirst().orElseThrow(() -> FleetApiException.notFound("RIDER_NOT_FOUND", "No such rider."));
        if (!"PENDING".equals(rider.get("status"))) {
            throw FleetApiException.conflict("APPLICATION_NOT_PENDING", "This rider is not applying any more. Refresh the page.");
        }
        // The row lock above holds back the rider's own changes (details, a new payout account) until this decision commits.
        if (!version.equals(jdbc.queryForObject(VERSION, String.class, riderId))) {
            throw FleetApiException.conflict("APPLICATION_CHANGED",
                "The rider changed their details or payout account while you were checking. Refresh the page.");
        }
        Map<UUID, Map<String, Object>> latest = new HashMap<>();
        jdbc.queryForList(LATEST, riderId).forEach(row -> latest.put((UUID) row.get("id"), row));
        List<String> verified = new ArrayList<>();
        List<String> fixed = new ArrayList<>();
        for (DocumentVerdict verdict : verdicts) {
            Map<String, Object> document = latest.get(verdict.documentId());
            if (document == null) {
                throw documentNotLatest(riderId, verdict.documentId());
            }
            String type = (String) document.get("type");
            if (!"PENDING".equals(document.get("status"))) {
                throw FleetApiException.conflict("DOCUMENT_NOT_PENDING", "The " + label(type) + " was already checked. Refresh the page.");
            }
            if ("OK".equals(verdict.verdict())) {
                LocalDate expiresOn = FleetRules.EXPIRING_DOCUMENTS.contains(type) ? verdict.expiresOn() : null;
                admin.verifyNow(by, riderId, verdict.documentId(), expiresOn);
                verified.add(label(type) + (expiresOn == null ? "" : " (valid until " + expiresOn + ")"));
            } else {
                String reason = FleetAdminService.reason(verdict.reason());
                admin.rejectNow(by, riderId, verdict.documentId(), reason);
                fixed.add(label(type) + ": " + reason);
            }
        }
        String account = null;
        if ("CONFIRM".equals(payout)) {
            PayoutAccount confirmed = admin.confirmNow(by, riderId).account();
            account = confirmed.method() + " " + confirmed.maskedAccount();
        } else if ("RETURN".equals(payout)) {
            if (jdbc.update("UPDATE fleet_schema.rider_payout_account SET state = 'REPLACED' WHERE rider_id = ? AND state = 'SUBMITTED'",
                riderId) == 0) {
                throw FleetApiException.notFound("NO_SUBMITTED_PAYOUT_ACCOUNT", "The rider has not sent a payout account to check.");
            }
            fixed.add("payout account: send it again, in your name and matching your bank proof");
        }
        boolean pilot = false;
        String status = "PENDING";
        if (approve) {
            List<String> needed = stillNeeded(riderId, (String) rider.get("vehicle_kind"));
            if (!needed.isEmpty()) {
                throw FleetApiException.unprocessable("APPLICATION_INCOMPLETE", "Still needed before approval: " + String.join(", ", needed) + ".");
            }
            // While test mode limits dispatch to the pilot riders, an approved rider joins them at once (before the role
            // change, which must come last).
            if (properties.testMode()) {
                jdbc.update("INSERT INTO fleet_schema.test_mode_rider (rider_id, note) VALUES (?, 'Added when approved') "
                    + "ON CONFLICT (rider_id) DO NOTHING", riderId);
                pilot = true;
            }
            String evidence = "Checked by hand on the application review: " + (verified.isEmpty() ? "documents checked earlier"
                : String.join(", ", verified)) + (account == null ? "" : "; payout account " + account + " confirmed") + ".";
            status = admin.recordStatusEvent(by, riderId, "RESTORE", "Application approved",
                evidence.length() > 2000 ? evidence.substring(0, 2000) : evidence, null, null, null).statusAfter();
        }
        String stage = jdbc.queryForObject("SELECT s.stage FROM (" + FleetAdminService.SUMMARY + ") s WHERE s.id = ?", String.class, riderId);
        ApplicationResult result = new ApplicationResult(riderId, approve ? "APPROVE" : "FIXES", status, stage, verified.size(),
            fixed.size(), account != null, "RETURN".equals(payout), pilot, policies.currentRateCard().isPresent());
        String summary = approve
            ? "Approved the application" + (verified.isEmpty() ? "" : ": verified " + String.join(", ", verified))
                + (account == null ? "" : "; confirmed the payout account " + account) + (pilot ? "; added to the pilot riders." : ".")
            : "Asked for fixes: " + String.join("; ", fixed) + (verified.isEmpty() ? "." : ". Verified " + String.join(", ", verified) + ".");
        return new Done(result, riderId, riderId.toString(), summary);
    }

    /** What still stops approval: required documents not verified (or expired), and no payout account confirmed. */
    private List<String> stillNeeded(UUID riderId, String vehicleKind) {
        Map<String, String> statuses = new HashMap<>();
        jdbc.queryForList(LATEST, riderId).forEach(row -> statuses.put((String) row.get("type"), (String) row.get("status")));
        List<String> needed = new ArrayList<>();
        for (String type : FleetRules.requiredDocuments(vehicleKind)) {
            String status = statuses.get(type);
            if (!"VERIFIED".equals(status)) {
                needed.add(label(type) + (status == null ? " (not sent)" : "PENDING".equals(status) ? " (mark it OK)" : " (needs a new photo)"));
            }
        }
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_payout_account WHERE rider_id = ? "
            + "AND state = 'ACTIVE')", Boolean.class, riderId))) {
            needed.add("a confirmed payout account");
        }
        return needed;
    }

    private FleetApiException documentNotLatest(UUID riderId, UUID documentId) {
        boolean older = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rider_document WHERE id = ? "
            + "AND rider_id = ?)", Boolean.class, documentId, riderId));
        return older ? FleetApiException.conflict("DOCUMENT_REPLACED", "The rider sent a newer photo of this document. Refresh the page.")
            : FleetApiException.notFound("DOCUMENT_NOT_FOUND", "No such document for this rider.");
    }

    private static String label(String type) {
        return FleetRiderService.DOCUMENT_LABELS.getOrDefault(type, type);
    }
}
