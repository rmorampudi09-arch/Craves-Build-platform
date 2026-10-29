package in.craves.integration.fleet.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetRoleClient;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminModels.ApplicationDecision;
import in.craves.integration.fleet.admin.FleetAdminModels.ApplicationResult;
import in.craves.integration.fleet.admin.FleetAdminModels.DocumentVerdict;
import in.craves.integration.fleet.admin.FleetAdminModels.RiderDetail;
import in.craves.integration.fleet.admin.FleetAdminModels.RiderPage;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderProfile;
import in.craves.integration.fleet.rider.FleetRiderModels.SignUp;
import in.craves.integration.fleet.rider.FleetRiderService;
import in.craves.integration.fleet.rider.FleetSignupService;
import in.craves.integration.payout.bank.BankDataCipher;
import in.craves.integration.security.CravesPrincipal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * One application, one decision (docs/riders/FLOWS.md) against a real database, each call in its own transaction: the stage
 * ops and the rider both see, the one-step approval, fixes, and what is refused without changing anything.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetApplicationDatabaseTest {
    static final List<String> PETROL = List.of("DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PUC", "PAN", "BANK_PROOF");
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final TransactionTemplate transaction = new TransactionTemplate(fleet.transactions);
    final Admin ops = new Admin(UUID.randomUUID(), "Admin +91 90xxxxx001");
    final FleetRoleClient roles = mock(FleetRoleClient.class);
    final LocalDate valid = LocalDate.now().plusYears(3);
    FleetPolicyStore policies;
    FleetAdminService admin;
    FleetApplicationService applications;
    FleetRiderService riders;

    @BeforeEach
    void setUp() {
        policies = new FleetPolicyStore(fleet.db, json);
        admin = new FleetAdminService(fleet.db, json, mock(FleetStorage.class), roles, mock(BankDataCipher.class));
        applications = new FleetApplicationService(fleet.db, admin, policies, FleetDatabase.properties(true));
        riders = new FleetRiderService(fleet.db, policies, FleetDatabase.properties(true), mock(FleetStorage.class));
    }

    @Test
    void oneApprovalChecksEverythingActivatesTheRiderAndPutsThemOnThePilotList() {
        UUID identity = UUID.randomUUID();
        UUID rider = applicant(identity, "PETROL");
        Map<String, UUID> documents = send(rider, PETROL);
        payoutSent(rider, "Ravi Kumar");
        assertThat(stage(rider)).isEqualTo("REVIEW");

        UUID key = UUID.randomUUID();
        ApplicationDecision approval = decision(rider, "APPROVE", allOk(documents), "CONFIRM");
        ApplicationResult result = (ApplicationResult) tx(() -> applications.decide(ops, true, key, rider, approval));

        assertThat(result.status()).isEqualTo("ACTIVE");
        assertThat(result.stage()).isEqualTo("ACTIVE");
        assertThat(result.documentsVerified()).isEqualTo(6);
        assertThat(result.payoutAccountConfirmed()).isTrue();
        assertThat(result.addedToPilot()).isTrue();
        // What the console tells ops next: without a rate card the rider waits for pay rates.
        assertThat(result.rateCardPublished()).isEqualTo(policies.currentRateCard().isPresent());
        assertThat(fleet.db.queryForList("SELECT type || ':' || status || ':' || COALESCE(expires_on::text, '-') FROM fleet_schema.rider_document "
            + "WHERE rider_id = ? ORDER BY type", String.class, rider)).containsExactly("BANK_PROOF:VERIFIED:-",
            "DRIVING_LICENCE:VERIFIED:" + valid, "PAN:VERIFIED:-", "PUC:VERIFIED:" + valid, "VEHICLE_INSURANCE:VERIFIED:" + valid,
            "VEHICLE_RC:VERIFIED:" + valid);
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.rider_payout_account WHERE rider_id = ?", String.class, rider))
            .isEqualTo("ACTIVE");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.test_mode_rider WHERE rider_id = ?", Integer.class, rider))
            .isEqualTo(1);
        assertThat(fleet.db.queryForMap("SELECT kind, status_before, status_after, reason FROM fleet_schema.rider_status_event WHERE rider_id = ?",
            rider)).containsEntry("kind", "RESTORE").containsEntry("status_before", "PENDING").containsEntry("status_after", "ACTIVE")
            .containsEntry("reason", "Application approved");
        verify(roles).grant(identity, rider);
        assertThat(fleet.db.queryForList("SELECT action FROM fleet_schema.admin_audit WHERE rider_id = ?", String.class, rider))
            .containsExactly("APPLICATION_APPROVED");

        // The same key and body answer the first result and change nothing more; the rider now counts as active.
        tx(() -> applications.decide(ops, true, key, rider, approval));
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.rider_status_event WHERE rider_id = ?", Integer.class, rider))
            .isEqualTo(1);
        RiderPage page = admin.listRiders(null, null, null, null);
        assertThat(page.counts()).containsEntry("ACTIVE", 1).containsEntry("REVIEW", 0);
    }

    @Test
    void aRiderWhoseEveryItemWasCheckedEarlierIsApprovedWithNothingMoreToMark() {
        // K Gopi's case: every document verified and the account confirmed one by one, but never activated.
        UUID identity = UUID.randomUUID();
        UUID rider = applicant(identity, "PETROL");
        send(rider, PETROL).forEach((type, id) -> fleet.db.update("UPDATE fleet_schema.rider_document SET status = 'VERIFIED', "
            + "expires_on = ?, reviewed_at = now() WHERE id = ?", valid, id));
        payoutSent(rider, "Ravi Kumar");
        fleet.db.update("UPDATE fleet_schema.rider_payout_account SET state = 'ACTIVE' WHERE rider_id = ?", rider);
        assertThat(stage(rider)).isEqualTo("REVIEW");

        ApplicationResult result = (ApplicationResult) tx(() -> applications.decide(ops, false, UUID.randomUUID(), rider,
            decision(rider, "APPROVE", List.of(), null)));
        assertThat(result.status()).isEqualTo("ACTIVE");
        verify(roles).grant(identity, rider);
    }

    @Test
    void approvalOfAnIncompleteApplicationIsRefusedAndChangesNothing() {
        UUID rider = applicant(UUID.randomUUID(), "PETROL");
        Map<String, UUID> documents = send(rider, PETROL.subList(0, 5));
        payoutSent(rider, "Ravi Kumar");
        assertThat(stage(rider)).isEqualTo("APPLYING");

        refused(() -> applications.decide(ops, true, UUID.randomUUID(), rider, decision(rider, "APPROVE", allOk(documents), "CONFIRM")),
            422, "APPLICATION_INCOMPLETE");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.rider_document WHERE rider_id = ? AND status = 'PENDING'",
            Integer.class, rider)).isEqualTo(5);
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.rider_payout_account WHERE rider_id = ?", String.class, rider))
            .isEqualTo("SUBMITTED");
        assertThat(fleet.db.queryForObject("SELECT status FROM fleet_schema.rider WHERE id = ?", String.class, rider)).isEqualTo("PENDING");
        verify(roles, never()).grant(any(), any());
    }

    @Test
    void fixesVerifyWhatWasFineAndTheRiderSeesOnlyWhatToSendAgain() {
        UUID identity = UUID.randomUUID();
        UUID rider = applicant(identity, "PETROL");
        Map<String, UUID> documents = send(rider, PETROL);
        payoutSent(rider, "Ravi Kumar");
        List<DocumentVerdict> verdicts = new ArrayList<>(allOk(documents));
        verdicts.removeIf(verdict -> verdict.documentId().equals(documents.get("DRIVING_LICENCE")));
        verdicts.add(new DocumentVerdict(documents.get("DRIVING_LICENCE"), "FIX", null, "The photo is blurry. Take it again in daylight."));

        ApplicationResult result = (ApplicationResult) tx(() -> applications.decide(ops, false, UUID.randomUUID(), rider,
            decision(rider, "FIXES", verdicts, "RETURN")));
        assertThat(result.status()).isEqualTo("PENDING");
        assertThat(result.stage()).isEqualTo("FIXES");
        assertThat(result.fixesAsked()).isEqualTo(2);
        assertThat(result.documentsVerified()).isEqualTo(5);

        RiderProfile profile = riders.profile(identity);
        assertThat(profile.payoutAccountReturned()).isTrue();
        assertThat(profile.payoutAccountSubmitted()).isNull();
        assertThat(profile.documents()).filteredOn(document -> "DL".equals(document.type())).hasSize(1);
        assertThat(profile.documents().stream().filter(document -> "DL".equals(document.type())).findFirst().orElseThrow())
            .satisfies(document -> {
                assertThat(document.status()).isEqualTo("REJECTED");
                assertThat(document.reason()).isEqualTo("The photo is blurry. Take it again in daylight.");
            });
        assertThat(profile.documents()).filteredOn(document -> "VERIFIED".equals(document.status())).hasSize(5);
        assertThat(fleet.db.queryForObject("SELECT summary FROM fleet_schema.admin_audit WHERE rider_id = ? AND action = 'APPLICATION_FIXES_ASKED'",
            String.class, rider)).startsWith("Asked for fixes: Driving licence: The photo is blurry.");

        // The rider sends both again: back to ops, and only the new photo and the account are left to check.
        UUID licence = document(rider, "DRIVING_LICENCE");
        payoutSent(rider, "Ravi Kumar");
        assertThat(stage(rider)).isEqualTo("REVIEW");
        ApplicationResult approved = (ApplicationResult) tx(() -> applications.decide(ops, true, UUID.randomUUID(), rider,
            decision(rider, "APPROVE", List.of(new DocumentVerdict(licence, "OK", valid, null)), "CONFIRM")));
        assertThat(approved.status()).isEqualTo("ACTIVE");
        verify(roles).grant(identity, rider);
    }

    @Test
    void theQueueShowsWhoseTurnItIs() {
        UUID applying = applicant(UUID.randomUUID(), "PETROL");
        send(applying, List.of("PAN"));
        UUID fixes = applicant(UUID.randomUUID(), "BICYCLE");
        Map<String, UUID> sent = send(fixes, List.of("PAN", "BANK_PROOF"));
        fleet.db.update("UPDATE fleet_schema.rider_document SET status = 'REJECTED', reason = 'Blurry', reviewed_at = now() WHERE id = ?",
            sent.get("PAN"));
        payoutSent(fixes, "Ravi Kumar");
        UUID review = applicant(UUID.randomUUID(), "ELECTRIC");
        send(review, List.of("DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PAN", "BANK_PROOF"));
        payoutSent(review, "Ravi Kumar");

        RiderPage all = admin.listRiders(null, null, null, null);
        assertThat(all.counts()).containsEntry("APPLYING", 1).containsEntry("FIXES", 1).containsEntry("REVIEW", 1).containsEntry("ACTIVE", 0);
        List<FleetAdminModels.RiderSummary> queue = admin.listRiders(null, "REVIEW", null, null).riders();
        assertThat(queue).hasSize(1);
        assertThat(queue.get(0).riderId()).isEqualTo(review);
        assertThat(queue.get(0).readySince()).isNotNull();
        assertThat(queue.get(0).missingDocuments()).isZero();
        List<FleetAdminModels.RiderSummary> still = admin.listRiders(null, "APPLYING", null, null).riders();
        assertThat(still).hasSize(1);
        assertThat(still.get(0).missingDocuments()).isEqualTo(5);
        assertThat(still.get(0).payoutAccountSent()).isFalse();
        assertThat(still.get(0).readySince()).isNull();
        List<FleetAdminModels.RiderSummary> toFix = admin.listRiders(null, "FIXES", null, null).riders();
        assertThat(toFix).hasSize(1);
        assertThat(toFix.get(0).documentsToFix()).isEqualTo(1);
        RiderDetail detail = admin.getRider(fixes);
        assertThat(detail.requiredDocuments()).containsExactly("PAN", "BANK_PROOF");
        assertThat(detail.rider().vehicleKind()).isEqualTo("BICYCLE");
        assertThat(detail.pilotRider()).isFalse();
    }

    @Test
    void staleOrInconsistentDecisionsAreRefused() {
        UUID rider = applicant(UUID.randomUUID(), "BICYCLE");
        Map<String, UUID> documents = send(rider, List.of("PAN", "BANK_PROOF"));
        payoutSent(rider, "Ravi Kumar");
        UUID newer = document(rider, "PAN");

        refused(() -> applications.decide(ops, true, UUID.randomUUID(), rider, decision(rider, "APPROVE",
            List.of(new DocumentVerdict(documents.get("PAN"), "OK", null, null)), "CONFIRM")), 409, "DOCUMENT_REPLACED");
        refused(() -> applications.decide(ops, true, UUID.randomUUID(), rider, decision(rider, "APPROVE",
            List.of(new DocumentVerdict(newer, "FIX", null, "Blurry photo")), null)), 422, "FIXES_IN_APPROVAL");
        refused(() -> applications.decide(ops, true, UUID.randomUUID(), rider, decision(rider, "FIXES",
            List.of(new DocumentVerdict(newer, "OK", null, null)), null)), 422, "NO_FIXES");
        refused(() -> applications.decide(ops, false, UUID.randomUUID(), rider, decision(rider, "APPROVE",
            List.of(new DocumentVerdict(newer, "OK", null, null)), "CONFIRM")), 403, "PAYMENTS_ADMIN_REQUIRED");
        refused(() -> applications.decide(ops, true, UUID.randomUUID(), rider, decision(rider, "FIXES",
            List.of(new DocumentVerdict(newer, "FIX", null, "x")), null)), 400, "VALIDATION_FAILED");
        refused(() -> applications.decide(ops, true, UUID.randomUUID(), rider, new ApplicationDecision("FIXES",
            List.of(new DocumentVerdict(newer, "FIX", null, "Blurry photo")), null, null)), 400, "VALIDATION_FAILED");

        fleet.db.update("UPDATE fleet_schema.rider_document SET status = 'VERIFIED', reviewed_at = now() WHERE id = ?", newer);
        refused(() -> applications.decide(ops, true, UUID.randomUUID(), rider, decision(rider, "APPROVE",
            List.of(new DocumentVerdict(newer, "OK", null, null)), "CONFIRM")), 409, "DOCUMENT_NOT_PENDING");

        UUID active = applicant(UUID.randomUUID(), "BICYCLE");
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'ACTIVE' WHERE id = ?", active);
        refused(() -> applications.decide(ops, true, UUID.randomUUID(), active, decision(active, "APPROVE", List.of(), null)),
            409, "APPLICATION_NOT_PENDING");
    }

    @Test
    void aDecisionOnWhatTheRiderChangedSinceThePageLoadedIsRefused() {
        UUID rider = applicant(UUID.randomUUID(), "BICYCLE");
        Map<String, UUID> documents = send(rider, List.of("PAN", "BANK_PROOF"));
        payoutSent(rider, "Ravi Kumar");
        String seen = admin.getRider(rider).applicationVersion();
        assertThat(seen).matches("[0-9a-f]{32}");

        // The rider sends another account while ops checks the first: ops never saw it, so nothing is confirmed or verified.
        payoutSent(rider, "Ravi Kumar");
        refused(() -> applications.decide(ops, true, UUID.randomUUID(), rider, new ApplicationDecision("APPROVE", allOk(documents),
            "CONFIRM", seen)), 409, "APPLICATION_CHANGED");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.rider_document WHERE rider_id = ? AND status = 'PENDING'",
            Integer.class, rider)).isEqualTo(2);
        assertThat(fleet.db.queryForObject("SELECT string_agg(state, ',' ORDER BY state) FROM fleet_schema.rider_payout_account "
            + "WHERE rider_id = ?", String.class, rider)).isEqualTo("REPLACED,SUBMITTED");
        // A new vehicle (or name) likewise, for fixes too.
        String reloaded = admin.getRider(rider).applicationVersion();
        fleet.db.update("UPDATE fleet_schema.rider SET vehicle_label = 'Hero Sprint' WHERE id = ?", rider);
        refused(() -> applications.decide(ops, true, UUID.randomUUID(), rider, new ApplicationDecision("FIXES",
            List.of(new DocumentVerdict(documents.get("PAN"), "FIX", null, "Blurry photo")), null, reloaded)), 409, "APPLICATION_CHANGED");

        // Checked again as it is now, the same decision goes through.
        ApplicationResult result = (ApplicationResult) tx(() -> applications.decide(ops, true, UUID.randomUUID(), rider,
            decision(rider, "APPROVE", allOk(documents), "CONFIRM")));
        assertThat(result.status()).isEqualTo("ACTIVE");
    }

    @Test
    void theReviewPageGetsEachTypesLatestPhotoHoweverManyCameAfterAndCountsOnlyThose() {
        UUID rider = applicant(UUID.randomUUID(), "BICYCLE");
        UUID pan = document(rider, "PAN");
        for (int i = 0; i < 21; i++) {
            document(rider, "BANK_PROOF");
        }
        RiderDetail detail = admin.getRider(rider);
        assertThat(detail.documents()).hasSize(20);
        assertThat(detail.documents().get(0).type()).isEqualTo("BANK_PROOF");
        assertThat(detail.documents().get(19).documentId()).isEqualTo(pan);
        assertThat(detail.rider().pendingDocuments()).isEqualTo(2);
        refused(() -> admin.getRider(UUID.randomUUID()), 404, "RIDER_NOT_FOUND");
    }

    @Test
    void theRiderGivesTheMakeAndModelOnceAndAnOlderAppKeepsIt() {
        FleetSignupService signup = new FleetSignupService(fleet.db, riders, mock(BankDataCipher.class));
        String phone = phone();
        CravesPrincipal principal = new CravesPrincipal(UUID.randomUUID(), phone, Set.of());
        tx(() -> signup.signUp(principal, new SignUp("Ravi Kumar", "te", "PETROL", "TS09EA1234", true, " Honda  Activa 6G ")));
        UUID rider = fleet.db.queryForObject("SELECT id FROM fleet_schema.rider WHERE phone = ?", UUID.class, phone);
        assertThat(admin.getRider(rider).rider().vehicleLabel()).isEqualTo("Honda Activa 6G");

        // An app before 1.2.0 sends no model: correcting the name keeps the vehicle as it is.
        tx(() -> signup.signUp(principal, new SignUp("Ravi Kumar Reddy", "te", "PETROL", "", true)));
        assertThat(fleet.db.queryForMap("SELECT name, vehicle_label, vehicle_reg_number FROM fleet_schema.rider WHERE id = ?", rider))
            .containsEntry("name", "Ravi Kumar Reddy").containsEntry("vehicle_label", "Honda Activa 6G")
            .containsEntry("vehicle_reg_number", "TS09EA1234");
        // A new kind without a model takes the kind's label.
        tx(() -> signup.signUp(principal, new SignUp("Ravi Kumar Reddy", "te", "ELECTRIC", "", true)));
        assertThat(fleet.db.queryForObject("SELECT vehicle_label FROM fleet_schema.rider WHERE id = ?", String.class, rider))
            .isEqualTo("Electric two-wheeler");
        refused(() -> signup.signUp(principal, new SignUp("Ravi Kumar Reddy", "te", "ELECTRIC", "", true, "<script>")), 400,
            "VALIDATION_FAILED");
    }

    private UUID applicant(UUID identity, String kind) {
        UUID id = UUID.randomUUID();
        fleet.db.update("INSERT INTO fleet_schema.rider (id, identity_id, name, phone, vehicle_kind, vehicle_reg_number, created_by) "
            + "VALUES (?, ?, 'Ravi Kumar', ?, ?, 'TS09EA1234', ?)", id, identity, phone(), kind, identity);
        return id;
    }

    /** One PENDING photo of each type; answers the ids by type. */
    private Map<String, UUID> send(UUID rider, List<String> types) {
        Map<String, UUID> ids = new LinkedHashMap<>();
        types.forEach(type -> ids.put(type, document(rider, type)));
        return ids;
    }

    /** clock_timestamp(): a photo sent later in the same test is the newer one. */
    private UUID document(UUID rider, String type) {
        UUID id = UUID.randomUUID();
        fleet.db.update("INSERT INTO fleet_schema.rider_document (id, rider_id, type, blob_name, content_type, size_bytes, uploaded_at) "
            + "VALUES (?, ?, ?, 'riders/x/doc.jpg', 'image/jpeg', 100, clock_timestamp())", id, rider, type);
        return id;
    }

    private void payoutSent(UUID rider, String holder) {
        fleet.db.update("UPDATE fleet_schema.rider_payout_account SET state = 'REPLACED' WHERE rider_id = ? AND state = 'SUBMITTED'", rider);
        fleet.db.update("INSERT INTO fleet_schema.rider_payout_account (id, rider_id, method, encrypted_details, fingerprint, masked_account, "
            + "holder_name, state, verified_in_person, set_by, set_by_name) VALUES (?, ?, 'UPI', 'k', ?, 'ra****@okaxis', ?, 'SUBMITTED', false, "
            + "?, ?)", UUID.randomUUID(), rider, "k." + UUID.randomUUID(), holder, UUID.randomUUID(), holder);
    }

    /** A decision on the application as the review page shows it now. */
    private ApplicationDecision decision(UUID rider, String decision, List<DocumentVerdict> documents, String payout) {
        return new ApplicationDecision(decision, documents, payout, admin.getRider(rider).applicationVersion());
    }

    /** OK for every document, with the expiry printed on the four riding documents. */
    private List<DocumentVerdict> allOk(Map<String, UUID> documents) {
        return documents.entrySet().stream().map(entry -> new DocumentVerdict(entry.getValue(), "OK",
            List.of("PAN", "BANK_PROOF").contains(entry.getKey()) ? null : valid, null)).toList();
    }

    private String stage(UUID rider) {
        return admin.getRider(rider).rider().stage();
    }

    private <T> T tx(Supplier<T> work) {
        return transaction.execute(status -> work.get());
    }

    private void refused(Supplier<Object> work, int status, String code) {
        assertThatThrownBy(() -> tx(work)).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }

    private static String phone() {
        return "+9198" + ThreadLocalRandom.current().nextInt(10_000_000, 99_999_999);
    }
}
